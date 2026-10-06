/**
 * FormBridge.gs - connects the Senior Authority Google Form to the checklist app.
 *
 * Install: open Google Apps Script (script.google.com) or from a Google Form:
 *   1. Paste this entire file into Code.gs
 *   2. Script Properties (Project Settings -> Script Properties):
 *        APP_BASE_URL        checklist app origin
 *        APP_SECRET          value matching the app's APP_SECRET env var (used for health pings and form submissions)
 *        BRIDGE_SECRET       secret used by the app-side dispatcher to refresh forms (matches FORM_BRIDGE_SECRET)
 *        N8N_WEBHOOK_URL     optional secondary notification endpoint
 *        N8N_WEBHOOK_SECRET  optional secret for the secondary notification endpoint
 *        INDEPENDENT_DAILY_FORMS  "true" (default: creates independent Google Form each day)
 *   3. Run setup() once to initialize triggers (retryPending every 15 minutes, reportHealth every 6 hours).
 *   4. Deploy as Web App (Execute as: Me, Who has access: Anyone).
 *   5. Set the /exec URL as APPS_SCRIPT_WEBAPP_URL on the app service.
 */

var DEFAULT_APP_BASE_URL = 'https://swiftseniorchecklist.onrender.com';
var DEFAULT_APP_SECRET = 'z4Q4QhUKVdHDYXVj3cPZM2YtiFHcJ4WHor8C/UWJ3yP5QqBLCofWZsHrXjfIW/Ap';
var DEFAULT_BRIDGE_SECRET = 'qwertyuiopasdfghjkl';

var DONE_TITLE = 'Tick every task that is DONE today';
var REMARKS_TITLE = 'Remarks for anything NOT done';
var CLEAR_RESPONSES_ON_REFRESH = false; // Preserves historical responses for independent forms

// ---------------------------------------------------------------- setup ----

/** Run once from the editor (Run -> setup). Safe to run again. */
function setup() {
  var props = PropertiesService.getScriptProperties();

  // Try to bind to active form if opened from a form container
  try {
    var activeForm = FormApp.getActiveForm();
    if (activeForm) {
      props.setProperty('FORM_ID', activeForm.getId());
      ScriptApp.newTrigger('onFormSubmit_').forForm(activeForm).onFormSubmit().create();
    }
  } catch (e) {}

  // Remove all legacy form-submit triggers before creating a fresh one. Old
  // triggers can fire after a form is deleted/recreated and then crash on a
  // response that no longer exists for that stale form.
  cleanupStaleSubmitTriggers_();

  // Clean existing project triggers to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'retryPending_' || fn === 'reportHealth_') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Retry queue every 15 minutes; each item observes its own backoff time.
  ScriptApp.newTrigger('retryPending_').timeBased().everyMinutes(15).create();

  // Report health every 6 hours
  ScriptApp.newTrigger('reportHealth_').timeBased().everyHours(6).create();

  var missing = ['BRIDGE_SECRET', 'APP_BASE_URL', 'APP_SECRET'].filter(function (k) {
    return !prop_(k);
  });
  Logger.log(missing.length
    ? 'Setup completed with warnings. Missing Script Properties: ' + missing.join(', ')
    : 'Setup successful! Deploy as a Web App (Anyone can access) and set its /exec URL as APPS_SCRIPT_WEBAPP_URL on the app service.');
}

// ----------------------------------------------- app -> refresh form ----

/** Web app entry point accepts signed JSON refresh/link actions from the app. */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (!prop_('BRIDGE_SECRET') || body.secret !== prop_('BRIDGE_SECRET')) {
      return json_({ ok: false, error: 'unauthorized' });
    }
    if (body.action === 'refresh') {
      return json_(refreshForm_(body));
    }
    if (body.action === 'link') {
      return json_(linkForm_(body));
    }
    if (body.action === 'refresh_all') {
      return json_(refreshAllForms_(body));
    }
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet() {
  return json_({ ok: true, service: 'swift-form-bridge' });
}

function linkForm_(body) {
  var dateStr = String(body.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { ok: false, error: 'invalid_date' };
  }
  var employeeName = body.employeeName ? String(body.employeeName).trim() : null;
  if (!employeeName) {
    return { ok: false, error: 'employee_required' };
  }

  var formKey = 'FORM_ID_' + dateStr + '_' + employeeName.replace(/[^a-zA-Z0-9]/g, '_');
  var formId = prop_(formKey);
  if (!formId) {
    return { ok: false, error: 'form_not_found', date: dateStr, employeeName: employeeName };
  }

  var urlKey = 'FORM_URL_' + formKey;
  var formUrl = prop_(urlKey);
  if (!formUrl) {
    try {
      var form = FormApp.openById(formId);
      formUrl = form.getPublishedUrl() || form.getEditUrl();
      if (formUrl) {
        var props = PropertiesService.getScriptProperties();
        props.setProperty(urlKey, formUrl);
        props.setProperty('FORM_DATE_' + formId, dateStr);
      }
    } catch (err) {
      console.error('[FormBridge] Could not resolve existing form URL for ' + formId + ': ' + String(err));
    }
  }
  if (!formUrl) {
    return { ok: false, error: 'form_url_not_found', date: dateStr, employeeName: employeeName };
  }

  return { ok: true, date: dateStr, employeeName: employeeName, formId: formId, formUrl: formUrl, publishedUrl: formUrl };
}

function refreshForm_(body) {
  var choices = Array.isArray(body.choices) ? body.choices.slice() : [];
  if (!choices.length) {
    return { ok: false, error: 'no_choices' };
  }

  var dateStr = String(body.date || Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd'));
  var employeeName = body.employeeName ? String(body.employeeName).trim() : null;

  var formKey = employeeName
    ? 'FORM_ID_' + dateStr + '_' + employeeName.replace(/[^a-zA-Z0-9]/g, '_')
    : 'FORM_ID_' + dateStr;
  var signatureKey = 'FORM_SIGNATURE_' + formKey;
  var urlKey = 'FORM_URL_' + formKey;
  var signature = JSON.stringify({ version: 2, employeeName: employeeName, choices: choices });
  var props = PropertiesService.getScriptProperties();

  if (prop_(signatureKey) === signature && prop_(urlKey)) {
    return {
      ok: true,
      date: dateStr,
      employeeName: employeeName,
      count: choices.length,
      formId: prop_(formKey),
      formUrl: prop_(urlKey),
      publishedUrl: prop_(urlKey),
      unchanged: true
    };
  }

  var formTitle = employeeName
    ? 'Daily Checklist — ' + employeeName + ' (' + dateStr + ')'
    : 'Senior Authority Daily Checklist - ' + dateStr;

  var existingFormId = prop_(formKey);
  var form = null;

  if (existingFormId) {
    try {
      form = FormApp.openById(existingFormId);
    } catch (e) {
      form = null;
    }
  }

  if (existingFormId && form && form.getResponses().length > 0) {
    var preservedUrl = prop_(urlKey) || form.getPublishedUrl() || form.getEditUrl();
    if (preservedUrl) {
      props.setProperty('FORM_DATE_' + form.getId(), dateStr);
      Logger.log('[FormBridge] Preserved existing responses; form choices not changed for ' + form.getId());
      return {
        ok: true,
        date: dateStr,
        employeeName: employeeName,
        count: choices.length,
        formId: form.getId(),
        formUrl: preservedUrl,
        publishedUrl: preservedUrl,
        unchanged: true,
        preservedResponses: true
      };
    }
  }

  if (!form) {
    form = FormApp.create(formTitle);
    form.setCollectEmail(false);
    PropertiesService.getScriptProperties().setProperty(formKey, form.getId());
    PropertiesService.getScriptProperties().setProperty('FORM_DATE_' + form.getId(), dateStr);
  }

  ensureSubmitTrigger_(form);
  var formDescription = 'Tick every task that is completed today (' + dateStr + '). For anything not done, add notes in the remarks section below.';
  var updatedInBatch = updateFormInBatch_(form, formTitle, formDescription, employeeName, choices, body.byEmployee);

  if (!updatedInBatch) {
    form.setTitle(formTitle);
    form.setDescription(formDescription);

    var existingItems = form.getItems();
    for (var i = 0; i < existingItems.length; i++) {
      form.deleteItem(existingItems[i]);
    }

    if (employeeName) {
      addTaskSection_(form, '📋 Tick Tasks Completed by ' + employeeName + ' (' + choices.length + ')', choices);
      addRemarkFieldsForChoices_(form, choices);
    } else if (Array.isArray(body.byEmployee) && body.byEmployee.length > 0) {
      body.byEmployee.forEach(function (emp) {
        if (Array.isArray(emp.choices) && emp.choices.length > 0) {
          addTaskSection_(form, '👤 ' + emp.employeeName + ' — Completed Tasks (' + emp.choices.length + ')', emp.choices);
          addRemarkFieldsForChoices_(form, emp.choices);
        }
      });
    } else {
      addTaskSection_(form, DONE_TITLE, choices);
      addRemarkFieldsForChoices_(form, choices);
    }

    form.addParagraphTextItem()
      .setTitle(REMARKS_TITLE)
      .setHelpText('General remarks or notes (e.g. Plant-wide observations, or CL-20260920-XXXX: reason)')
      .setRequired(false);
  }

  form.setAcceptingResponses(true);
  var publishedUrl = form.getPublishedUrl() || form.getEditUrl();
  props.setProperty('FORM_DATE_' + form.getId(), dateStr);
  props.setProperty('FORM_DATE', dateStr);
  props.setProperty('LATEST_FORM_URL', publishedUrl);
  props.setProperty(signatureKey, signature);
  props.setProperty(urlKey, publishedUrl);

  return {
    ok: true,
    date: dateStr,
    employeeName: employeeName,
    count: choices.length,
    formId: form.getId(),
    formUrl: publishedUrl,
    publishedUrl: publishedUrl
  };
}

function addTaskSection_(form, title, choices) {
  var item = form.addCheckboxItem();
  item.setTitle(title)
    .setChoiceValues(choices)
    .setRequired(false);
}

function addRemarkFieldsForChoices_(form, choices) {
  for (var i = 0; i < choices.length; i++) {
    var choice = String(choices[i]);
    var codeMatch = choice.match(/CL-\d{8}-[A-Za-z0-9]+/i);
    var codeStr = codeMatch ? codeMatch[0] : '';
    var cleanTitle = choice.length > 90 ? choice.slice(0, 87) + '...' : choice;
    var item = form.addTextItem();
    item.setTitle('💬 Remark for: ' + cleanTitle)
      .setHelpText(codeStr ? 'Optional remark for ' + codeStr : 'Optional remark for this task')
      .setRequired(false);
  }
}

function updateFormInBatch_(form, formTitle, formDescription, employeeName, choices, byEmployee) {
  try {
    var requests = [{
      updateFormInfo: {
        info: { title: formTitle, description: formDescription },
        updateMask: 'title,description'
      }
    }];
    var existingItems = form.getItems();

    for (var deleteIndex = existingItems.length - 1; deleteIndex >= 0; deleteIndex--) {
      requests.push({ deleteItem: { location: { index: deleteIndex } } });
    }

    var sections = [];
    if (employeeName) {
      sections.push({
        title: '📋 Tick Tasks Completed by ' + employeeName + ' (' + choices.length + ')',
        choices: choices
      });
    } else if (Array.isArray(byEmployee) && byEmployee.length > 0) {
      byEmployee.forEach(function (emp) {
        if (Array.isArray(emp.choices) && emp.choices.length > 0) {
          sections.push({
            title: '👤 ' + emp.employeeName + ' — Completed Tasks (' + emp.choices.length + ')',
            choices: emp.choices
          });
        }
      });
    } else {
      sections.push({ title: DONE_TITLE, choices: choices });
    }

    var itemIndex = 0;
    sections.forEach(function (section) {
      requests.push({
        createItem: {
          item: {
            title: section.title,
            questionItem: {
              question: {
                required: false,
                choiceQuestion: {
                  type: 'CHECKBOX',
                  options: section.choices.map(function (choice) { return { value: String(choice) }; })
                }
              }
            }
          },
          location: { index: itemIndex++ }
        }
      });

      section.choices.forEach(function (choice) {
        var choiceText = String(choice);
        var codeMatch = choiceText.match(/CL-\d{8}-[A-Za-z0-9]+/i);
        var codeStr = codeMatch ? codeMatch[0] : '';
        var cleanTitle = choiceText.length > 90 ? choiceText.slice(0, 87) + '...' : choiceText;
        requests.push({
          createItem: {
            item: {
              title: '💬 Remark for: ' + cleanTitle,
              description: codeStr ? 'Optional remark for ' + codeStr : 'Optional remark for this task',
              questionItem: { question: { required: false, textQuestion: { paragraph: false } } }
            },
            location: { index: itemIndex++ }
          }
        });
      });
    });

    requests.push({
      createItem: {
        item: {
          title: REMARKS_TITLE,
          description: 'General remarks or notes (e.g. Plant-wide observations, or CL-20260920-XXXX: reason)',
          questionItem: { question: { required: false, textQuestion: { paragraph: true } } }
        },
        location: { index: itemIndex }
      }
    });

    var response = UrlFetchApp.fetch(
      'https://forms.googleapis.com/v1/forms/' + encodeURIComponent(form.getId()) + ':batchUpdate',
      {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        payload: JSON.stringify({ requests: requests, includeFormInResponse: false }),
        muteHttpExceptions: true
      }
    );
    var status = response.getResponseCode();
    if (status >= 200 && status < 300) {
      return true;
    }

    console.error('[FormBridge] Forms API batch update failed (' + status + '): ' + response.getContentText().slice(0, 500));
    return false;
  } catch (err) {
    console.error('[FormBridge] Forms API batch update unavailable; using Apps Script builder: ' + err);
    return false;
  }
}

function cleanupStaleSubmitTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var trigger = triggers[i];
    if (trigger.getHandlerFunction() !== 'onFormSubmit_') {
      continue;
    }

    var sourceId = trigger.getTriggerSourceId ? trigger.getTriggerSourceId() : '';
    if (!sourceId) {
      ScriptApp.deleteTrigger(trigger);
      continue;
    }

    try {
      FormApp.openById(sourceId);
    } catch (err) {
      ScriptApp.deleteTrigger(trigger);
    }
  }
}

function ensureSubmitTrigger_(form) {
  var triggers = ScriptApp.getProjectTriggers();
  var staleFound = false;
  for (var i = 0; i < triggers.length; i++) {
    var trigger = triggers[i];
    if (trigger.getHandlerFunction() !== 'onFormSubmit_') {
      continue;
    }

    if (!trigger.getTriggerSourceId || trigger.getTriggerSourceId() !== form.getId()) {
      staleFound = true;
      ScriptApp.deleteTrigger(trigger);
      continue;
    }

    return true;
  }

  if (staleFound) {
    Logger.log('[FormBridge] Removed stale form submit triggers before attaching the current form.');
  }

  ScriptApp.newTrigger('onFormSubmit_')
    .forForm(form)
    .onFormSubmit()
    .create();

  return true;
}

function refreshAllForms_(body) {
  var byEmployee = Array.isArray(body.byEmployee) ? body.byEmployee.filter(function (emp) {
    return emp && Array.isArray(emp.choices) && emp.choices.length > 0;
  }) : [];

  if (!byEmployee.length) {
    return { ok: false, error: 'no_employees' };
  }

  var dateStr = String(body.date || Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd'));
  var results = [];

  byEmployee.forEach(function (emp) {
    var res = refreshForm_({
      date: dateStr,
      employeeName: emp.employeeName,
      choices: emp.choices
    });
    results.push({
      employeeName: emp.employeeName,
      employeePhone: emp.employeePhone,
      whatsappNumber: emp.whatsappNumber,
      taskCount: emp.choices.length,
      formUrl: res.formUrl
    });
  });

  return {
    ok: true,
    date: dateStr,
    forms: results
  };
}

// --------------------------------------------- 2. form submit -> n8n -> app ---

function onFormSubmit_(e) {
  var source = e && e.source ? e.source : null;
  var response = e && e.response ? e.response : null;
  if (!source || !response) {
    Logger.log('[FormBridge] Ignoring stale or missing form submission event.');
    return;
  }

  try {
    var formId = source && typeof source.getId === 'function' ? source.getId() : '';
    var payload = buildPayload_(response, formId);
    Logger.log('[FormBridge] Received submission for date: ' + payload.date + ', responseId: ' + payload.responseId + ', doneCount: ' + payload.doneRaw.length);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
      deadLetterPayload_(payload, 'invalid_submission_date');
      return;
    }

    deliverPayload_(payload);
  } catch (err) {
    var staleError = String(err || 'stale form response');
    Logger.log('[FormBridge] Dropped stale submit event from an orphaned form trigger: ' + staleError);
  }
}

function resolveSubmissionDate_(formId, properties) {
  var keyedDate = formId ? properties['FORM_DATE_' + formId] : '';
  if (keyedDate) {
    return String(keyedDate);
  }

  var keys = Object.keys(properties || {});
  for (var i = 0; i < keys.length; i++) {
    if (String(properties[keys[i]]) !== String(formId)) {
      continue;
    }
    var match = keys[i].match(/^FORM_ID_(\d{4}-\d{2}-\d{2})(?:_|$)/);
    if (match) {
      return match[1];
    }
  }

  return String(properties.FORM_DATE || '');
}

function buildPayload_(response, formId) {
  var doneCodes = [];
  var individualRemarks = [];
  var generalRemarks = '';

  response.getItemResponses().forEach(function (ir) {
    var item = ir.getItem();
    var type = item.getType();
    var title = item.getTitle() || '';
    var resp = ir.getResponse();

    if (type === FormApp.ItemType.CHECKBOX) {
      var list = Array.isArray(resp) ? resp : (resp ? [String(resp)] : []);
      list.forEach(function (choice) {
        var m = String(choice).match(/CL-\d{8}-[A-Za-z0-9]+/i);
        if (m) { doneCodes.push(m[0]); }
      });
    } else if (type === FormApp.ItemType.TEXT) {
      // Individual task remark
      var textVal = String(resp || '').trim();
      if (textVal) {
        var codeInTitle = title.match(/CL-\d{8}-[A-Za-z0-9]+/i);
        if (codeInTitle) {
          individualRemarks.push(codeInTitle[0] + ': ' + textVal);
        } else {
          individualRemarks.push(title + ': ' + textVal);
        }
      }
    } else if (type === FormApp.ItemType.PARAGRAPH_TEXT) {
      var pVal = String(resp || '').trim();
      if (pVal) {
        generalRemarks = generalRemarks ? generalRemarks + '\n' + pVal : pVal;
      }
    }
  });

  // Combine individual remarks with any general remarks
  var combinedRemarks = individualRemarks.slice();
  if (generalRemarks) {
    combinedRemarks.push(generalRemarks);
  }
  var finalRemarksText = combinedRemarks.join('\n');

  var props = PropertiesService.getScriptProperties().getProperties();
  var formDate = resolveSubmissionDate_(formId, props);

  var payload = {
    responseId: response.getId(),
    submittedAt: response.getTimestamp().toISOString(),
    doneRaw: doneCodes,
    remarksRaw: finalRemarksText,
    date: formDate
  };
  return payload;
}

function deadLetterPayload_(payload, reason, responseBody) {
  var responseId = String(payload.responseId || 'unknown');
  var props = PropertiesService.getScriptProperties();
  props.setProperty('DEAD_LETTER_' + responseId, JSON.stringify({
    payload: payload,
    reason: reason,
    responseBody: responseBody || null,
    deadLetteredAt: new Date().toISOString()
  }));
  props.deleteProperty('PENDING_' + responseId);
  Logger.log('[FormBridge] Dead-lettered response ' + responseId + ': ' + reason + ', date=' + String(payload.date || ''));
}

function classifyAppStatus_(status) {
  if (status >= 200 && status < 300) { return 'success'; }
  if (status === 401) { return 'configuration_error'; }
  if (status === 429 || status >= 500) { return 'retry'; }
  return 'dead_letter';
}

function retryDelayMs_(attempts) {
  var delayMinutes = Math.min(15 * Math.pow(2, Math.max(0, attempts - 1)), 75);
  return delayMinutes * 60 * 1000;
}

function postToApp_(payload) {
  var baseUrl = prop_('APP_BASE_URL');
  var appSecret = prop_('APP_SECRET');
  if (!baseUrl || !appSecret) {
    return { kind: 'configuration_error', message: 'APP_BASE_URL or APP_SECRET is missing' };
  }

  try {
    var res = UrlFetchApp.fetch(String(baseUrl).replace(/\/+$/, '') + '/api/integrations/form/submit', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-cron-secret': appSecret },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      followRedirects: false
    });
    var code = res.getResponseCode();
    return {
      kind: classifyAppStatus_(code),
      status: code,
      responseBody: res.getContentText(),
      message: 'App returned HTTP ' + code
    };
  } catch (err) {
    return { kind: 'retry', message: 'Could not reach app: ' + String(err) };
  }
}

function notifyN8n_(payload) {
  var url = prop_('N8N_WEBHOOK_URL');
  if (!url) { return; }
  var secret = prop_('N8N_WEBHOOK_SECRET');
  if (!secret) {
    console.error('[FormBridge] Optional n8n notification skipped: N8N_WEBHOOK_SECRET is not configured. App intake succeeded.');
    return;
  }

  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-webhook-secret': secret },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      followRedirects: true
    });
    var code = res.getResponseCode();
    if (code < 200 || code >= 300) {
      console.error('[FormBridge] Optional n8n notification failed with HTTP ' + code + '. App intake succeeded.');
    }
  } catch (err) {
    console.error('[FormBridge] Optional n8n notification failed: ' + String(err) + '. App intake succeeded.');
  }
}

function savePending_(payload, attempts, nextAttemptAt, options) {
  var record = {
    payload: payload,
    attempts: attempts,
    nextAttemptAt: nextAttemptAt ? nextAttemptAt.toISOString() : null,
    blocked: Boolean(options && options.blocked),
    lastError: options && options.message ? String(options.message).slice(0, 500) : null
  };
  PropertiesService.getScriptProperties().setProperty('PENDING_' + payload.responseId, JSON.stringify(record));
  return record;
}

function deliverPayload_(payload) {
  var result = postToApp_(payload);
  if (result.kind === 'success') {
    PropertiesService.getScriptProperties().deleteProperty('PENDING_' + payload.responseId);
    notifyN8n_(payload);
    return;
  }
  if (result.kind === 'dead_letter') {
    deadLetterPayload_(payload, 'app_http_' + result.status, result.responseBody);
    return;
  }
  if (result.kind === 'configuration_error') {
    savePending_(payload, 0, null, { blocked: true, message: result.message });
    console.error('[FormBridge] APP INTAKE BLOCKED: ' + result.message + '. Response ' + payload.responseId + ' is preserved and will not consume retries.');
    return;
  }

  var nextAttemptAt = new Date(Date.now() + retryDelayMs_(1));
  savePending_(payload, 1, nextAttemptAt, { message: result.message });
  Logger.log('[FormBridge] App intake queued for retry: response=' + payload.responseId + ', attempt=1, nextAttemptAt=' + nextAttemptAt.toISOString());
}

/** Time-driven every 15 minutes; each response is retried no more than 20 times. */
function retryPending_() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var replayed = 0;
  var deadLettered = 0;
  var blocked = 0;
  var now = Date.now();

  Object.keys(all).forEach(function (key) {
    if (key.indexOf('PENDING_') !== 0) { return; }

    var saved;
    try {
      saved = JSON.parse(all[key]);
    } catch (err) {
      deadLetterPayload_({ responseId: key.slice('PENDING_'.length), rawPayload: all[key], date: '' }, 'invalid_pending_payload');
      deadLettered += 1;
      return;
    }

    var record = saved && saved.payload ? saved : { payload: saved, attempts: 0 };
    var payload = record.payload;
    if (!payload || typeof payload !== 'object') {
      deadLetterPayload_({ responseId: key.slice('PENDING_'.length), rawPayload: all[key], date: '' }, 'invalid_pending_payload');
      deadLettered += 1;
      return;
    }
    if (record.blocked) {
      blocked += 1;
      return;
    }

    var normalizedDate = false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(payload.date || ''))) {
      var leadingDate = String(payload.date || '').match(/^(\d{4}-\d{2}-\d{2})(?:_|$)/);
      if (!leadingDate) {
        deadLetterPayload_(payload, 'invalid_pending_date');
        deadLettered += 1;
        return;
      }
      payload.date = leadingDate[1];
      normalizedDate = true;
    }

    var nextAttempt = record.nextAttemptAt ? Date.parse(record.nextAttemptAt) : 0;
    if (!normalizedDate && Number.isFinite(nextAttempt) && nextAttempt > now) { return; }

    var result = postToApp_(payload);
    if (normalizedDate) { replayed += 1; }
    if (result.kind === 'success') {
      props.deleteProperty(key);
      notifyN8n_(payload);
      return;
    }
    if (result.kind === 'dead_letter') {
      deadLetterPayload_(payload, 'app_http_' + result.status, result.responseBody);
      deadLettered += 1;
      return;
    }
    if (result.kind === 'configuration_error') {
      record.blocked = true;
      record.lastError = result.message;
      props.setProperty(key, JSON.stringify(record));
      console.error('[FormBridge] APP INTAKE BLOCKED: ' + result.message + '. Response ' + payload.responseId + ' is preserved and will not consume retries.');
      blocked += 1;
      return;
    }

    var attempts = (Number(record.attempts) || 0) + 1;
    if (attempts >= 20) {
      deadLetterPayload_(payload, 'app_retry_limit_exhausted', result.message);
      deadLettered += 1;
      return;
    }
    var retryAt = new Date(Date.now() + retryDelayMs_(attempts));
    savePending_(payload, attempts, retryAt, { message: result.message });
  });

  Logger.log('[FormBridge] Pending intake sweep complete: date-normalized/replayed=' + replayed + ', dead-lettered=' + deadLettered + ', blocked=' + blocked);
}

function unblockPending_() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var unblocked = 0;
  Object.keys(all).forEach(function (key) {
    if (key.indexOf('PENDING_') !== 0) { return; }
    try {
      var record = JSON.parse(all[key]);
      if (record && record.payload && record.blocked) {
        record.blocked = false;
        record.attempts = Number(record.attempts) || 0;
        record.nextAttemptAt = null;
        props.setProperty(key, JSON.stringify(record));
        unblocked += 1;
      }
    } catch (err) {
      console.error('[FormBridge] Could not unblock pending property ' + key + ': ' + String(err));
    }
  });
  Logger.log('[FormBridge] Unblocked pending intake records: ' + unblocked);
}

function buildHealthPayload_(properties) {
  var pendingCount = 0;
  var deadLetterCount = 0;
  var blockedCount = 0;
  var oldestPendingMs = null;
  var all = properties || {};

  Object.keys(all).forEach(function (key) {
    if (key.indexOf('DEAD_LETTER_') === 0) {
      deadLetterCount += 1;
      return;
    }
    if (key.indexOf('PENDING_') !== 0) {
      return;
    }

    var saved;
    try {
      saved = JSON.parse(all[key]);
    } catch (err) {
      return;
    }

    if (!saved || typeof saved !== 'object') {
      return;
    }

    var record = saved && saved.payload ? saved : { payload: saved, attempts: 0, blocked: false };
    if (!record || typeof record !== 'object') {
      return;
    }

    if (record.blocked) {
      blockedCount += 1;
      return;
    }

    pendingCount += 1;
    if (record.payload && record.payload.submittedAt) {
      var submittedMs = Date.parse(record.payload.submittedAt);
      if (Number.isFinite(submittedMs)) {
        if (!oldestPendingMs || submittedMs < oldestPendingMs) {
          oldestPendingMs = submittedMs;
        }
      }
    }
  });

  return {
    pendingCount: pendingCount,
    deadLetterCount: deadLetterCount,
    blockedCount: blockedCount,
    oldestPendingAgeMinutes: oldestPendingMs ? Math.floor((Date.now() - oldestPendingMs) / 1000 / 60) : null,
    scriptVersion: 'v1'
  };
}

/** Time-driven every 6 hours; reports health of the submission queue to the app. */
function reportHealth_() {
  var props = PropertiesService.getScriptProperties();
  var payload = buildHealthPayload_(props.getProperties());

  var baseUrl = prop_('APP_BASE_URL');
  var appSecret = prop_('APP_SECRET');

  if (!baseUrl || !appSecret) {
    console.warn('[FormBridge] Health report skipped: APP_BASE_URL or APP_SECRET is missing');
    return;
  }

  try {
    var res = UrlFetchApp.fetch(String(baseUrl).replace(/\/+$/, '') + '/api/integrations/form/health-ping', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-cron-secret': appSecret },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      followRedirects: false
    });
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) {
      Logger.log('[FormBridge] Health report sent: pending=' + payload.pendingCount + ', deadLettered=' + payload.deadLetterCount + ', blocked=' + payload.blockedCount + ', oldestPendingAgeMinutes=' + payload.oldestPendingAgeMinutes);
    } else {
      console.warn('[FormBridge] Health report failed with HTTP ' + code + ': ' + res.getContentText().slice(0, 500));
    }
  } catch (err) {
    console.warn('[FormBridge] Health report failed: ' + String(err));
  }
}

function prop_(key) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  if (v === null || v === undefined || v === '') {
    if (key === 'APP_BASE_URL') return DEFAULT_APP_BASE_URL;
    if (key === 'APP_SECRET') return DEFAULT_APP_SECRET;
    if (key === 'BRIDGE_SECRET') return DEFAULT_BRIDGE_SECRET;
    return '';
  }
  return v;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

