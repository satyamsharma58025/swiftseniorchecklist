/**
 * FormBridge.gs - connects the Senior Authority Google Form to n8n.
 *
 * Install: open Google Apps Script (script.google.com) or from a Google Form:
 *   1. Paste this entire file into Code.gs
 *   2. Script Properties (Project Settings -> Script Properties):
 *        BRIDGE_SECRET       any random string (must match n8n Config node)
 *        N8N_WEBHOOK_URL     n8n Production Webhook URL (e.g. https://your-n8n/webhook/swift-form-submitted)
 *        N8N_WEBHOOK_SECRET  webhook secret (must match n8n Header Auth)
 *        INDEPENDENT_DAILY_FORMS  "true" (default: creates independent Google Form each day)
 *   3. Run setup() once to initialize triggers.
 *   4. Deploy as Web App (Execute as: Me, Who has access: Anyone).
 *   5. Copy the /exec URL into n8n's Config node APPS_SCRIPT_WEBAPP_URL.
 */

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

  // Clean existing project triggers to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'retryPending_') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Retry queue every 15 minutes for any failed webhook deliveries
  ScriptApp.newTrigger('retryPending_').timeBased().everyMinutes(15).create();

  var missing = ['BRIDGE_SECRET', 'N8N_WEBHOOK_URL', 'N8N_WEBHOOK_SECRET'].filter(function (k) {
    return !prop_(k);
  });
  Logger.log(missing.length
    ? 'Setup completed with warnings. Missing Script Properties: ' + missing.join(', ')
    : 'Setup successful! Deploy as a Web App (Anyone can access) and paste /exec URL into n8n.');
}

// ------------------------------------------------- 1. n8n -> rebuild form ----

/** Web app entry point. n8n POSTs JSON: { secret, action: 'refresh', date, choices: [...], byEmployee: [...] } */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (!prop_('BRIDGE_SECRET') || body.secret !== prop_('BRIDGE_SECRET')) {
      return json_({ ok: false, error: 'unauthorized' });
    }
    if (body.action === 'refresh') {
      return json_(refreshForm_(body));
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

function ensureSubmitTrigger_(form) {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var trigger = triggers[i];
    if (trigger.getHandlerFunction() === 'onFormSubmit_' && trigger.getTriggerSourceId && trigger.getTriggerSourceId() === form.getId()) {
      return true;
    }
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
  var formId = e.source && typeof e.source.getId === 'function' ? e.source.getId() : '';
  var payload = buildPayload_(e.response, formId);
  Logger.log('[FormBridge] Received submission for date: ' + payload.date + ', responseId: ' + payload.responseId + ', doneCount: ' + payload.doneRaw.length);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
    deadLetterPayload_(payload, 'invalid_submission_date');
    return;
  }

  if (!postToN8n_(payload)) {
    // n8n or the network was down: keep it and retry every 15 minutes.
    PropertiesService.getScriptProperties().setProperty('PENDING_' + payload.responseId, JSON.stringify(payload));
    Logger.log('[FormBridge] Saved to retry queue as PENDING_' + payload.responseId);
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

function deadLetterPayload_(payload, reason) {
  var responseId = String(payload.responseId || 'unknown');
  var props = PropertiesService.getScriptProperties();
  props.setProperty('DEAD_LETTER_' + responseId, JSON.stringify({
    payload: payload,
    reason: reason,
    deadLetteredAt: new Date().toISOString()
  }));
  props.deleteProperty('PENDING_' + responseId);
  Logger.log('[FormBridge] Dead-lettered response ' + responseId + ': ' + reason + ', date=' + String(payload.date || ''));
}

function postToN8n_(payload) {
  var url = prop_('N8N_WEBHOOK_URL');
  if (!url) {
    console.error('N8N_WEBHOOK_URL is not set.');
    return false;
  }
  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-webhook-secret': prop_('N8N_WEBHOOK_SECRET') || '' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      followRedirects: true
    });
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) { return true; }
    console.error('n8n returned ' + code + ': ' + res.getContentText().slice(0, 300));
    return false;
  } catch (err) {
    console.error('Could not reach n8n: ' + err);
    return false;
  }
}

/** Time-driven (every 15 min): re-send anything that failed. The app ignores duplicates. */
function retryPending_() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var replayed = 0;
  var deadLettered = 0;
  Object.keys(all).forEach(function (key) {
    if (key.indexOf('PENDING_') !== 0) { return; }

    var payload;
    try {
      payload = JSON.parse(all[key]);
    } catch (err) {
      deadLetterPayload_({ responseId: key.slice('PENDING_'.length), rawPayload: all[key], date: '' }, 'invalid_pending_payload');
      deadLettered += 1;
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(payload.date || ''))) {
      var leadingDate = String(payload.date || '').match(/^(\d{4}-\d{2}-\d{2})(?:_|$)/);
      if (leadingDate) {
        payload.date = leadingDate[1];
        props.setProperty(key, JSON.stringify(payload));
        replayed += 1;
      } else {
        deadLetterPayload_(payload, 'invalid_pending_date');
        deadLettered += 1;
        return;
      }
    }

    if (postToN8n_(payload)) {
      props.deleteProperty(key);
    }
  });
  Logger.log('[FormBridge] Pending replay complete: date-normalized/replayed=' + replayed + ', dead-lettered=' + deadLettered);
}

function prop_(key) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  return v === null || v === undefined || v === '' ? '' : v;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
