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
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet() {
  return json_({ ok: true, service: 'swift-form-bridge' });
}

function refreshForm_(body) {
  var choices = body.choices;
  if (!Array.isArray(choices) || !choices.length) {
    return { ok: false, error: 'no_choices' };
  }

  var dateStr = String(body.date || Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd'));
  var form;
  var formKey = 'FORM_ID_' + dateStr;
  var existingFormId = prop_(formKey);

  // Check if an independent form for this date was already created
  if (existingFormId) {
    try {
      form = FormApp.openById(existingFormId);
    } catch (e) {
      form = null;
    }
  }

  // If no form for this date exists, check whether to create an independent form
  if (!form) {
    var useIndependent = prop_('INDEPENDENT_DAILY_FORMS');
    if (useIndependent === 'false' && prop_('FORM_ID')) {
      // Re-use single form mode (if user specifically configured)
      form = FormApp.openById(prop_('FORM_ID'));
      if (CLEAR_RESPONSES_ON_REFRESH) {
        form.deleteAllResponses();
      }
    } else {
      // DEFAULT: Create a brand new independent Google Form for today!
      // This ensures yesterday's form and responses are preserved independently in Drive.
      form = FormApp.create('Senior Authority Daily Checklist - ' + dateStr);
      form.setDescription('Tick every task that is DONE today for each employee. For anything NOT done, write a remark in the box below with: CHECKLIST-CODE: reason');
      form.setCollectEmail(false);

      // Attach the submit trigger to this new independent form
      ScriptApp.newTrigger('onFormSubmit_')
        .forForm(form)
        .onFormSubmit()
        .create();

      // Store form ID for today so repeat calls update this day's form without creating duplicates
      PropertiesService.getScriptProperties().setProperty(formKey, form.getId());
      PropertiesService.getScriptProperties().setProperty('FORM_DATE_' + form.getId(), dateStr);
    }
  }

  form.setTitle('Senior Authority Daily Checklist - ' + dateStr);
  form.setDescription('Tick every task that is DONE today. For anything not done, add a line in the remarks box: CHECKLIST-CODE: reason');

  // Clear previous questions in today's form before populating
  form.getItems().forEach(function (item) { form.deleteItem(item); });

  // 1. Group checklist points by Employee so employees are prominently visible!
  if (Array.isArray(body.byEmployee) && body.byEmployee.length > 0) {
    body.byEmployee.forEach(function (emp) {
      if (Array.isArray(emp.choices) && emp.choices.length > 0) {
        var empItem = form.addCheckboxItem();
        empItem.setTitle('👤 ' + emp.employeeName + ' (' + emp.choices.length + ' tasks)')
          .setChoiceValues(emp.choices)
          .setRequired(false);
      }
    });
  } else {
    // Fallback: all choices in one checkbox question
    form.addCheckboxItem()
      .setTitle(DONE_TITLE)
      .setChoiceValues(choices)
      .setRequired(false);
  }

  // 2. Remarks question for any tasks not done
  form.addParagraphTextItem()
    .setTitle(REMARKS_TITLE)
    .setHelpText('One line per task, format:  CHECKLIST-CODE: your remark   (e.g.  CL-20260920-YT001: waiting on HR)')
    .setRequired(false);

  form.setAcceptingResponses(true);
  PropertiesService.getScriptProperties().setProperty('FORM_DATE', dateStr);
  PropertiesService.getScriptProperties().setProperty('LATEST_FORM_URL', form.getPublishedUrl());

  return {
    ok: true,
    date: dateStr,
    count: choices.length,
    formId: form.getId(),
    formUrl: form.getPublishedUrl(),
    publishedUrl: form.getPublishedUrl()
  };
}

// --------------------------------------------- 2. form submit -> n8n -> app ---

function onFormSubmit_(e) {
  var payload = buildPayload_(e.response);
  if (!postToN8n_(payload)) {
    // n8n or the network was down: keep it and retry every 15 minutes.
    PropertiesService.getScriptProperties().setProperty('PENDING_' + payload.responseId, JSON.stringify(payload));
  }
}

function buildPayload_(response) {
  var doneCodes = [];
  var remarks = '';

  response.getItemResponses().forEach(function (ir) {
    var type = ir.getItem().getType();
    if (type === FormApp.ItemType.CHECKBOX) {
      var v = ir.getResponse();
      var list = Array.isArray(v) ? v : (v ? [String(v)] : []);
      list.forEach(function (choice) {
        var m = String(choice).match(/CL-\d{8}-[A-Za-z0-9]+/i);
        if (m) { doneCodes.push(m[0]); }
      });
    } else if (type === FormApp.ItemType.PARAGRAPH_TEXT) {
      remarks = String(ir.getResponse() || '');
    }
  });

  var formDate = prop_('FORM_DATE');
  var props = PropertiesService.getScriptProperties().getProperties();
  var editUrl = response.getEditResponseUrl() || '';
  for (var k in props) {
    if (k.indexOf('FORM_ID_') === 0 && editUrl.indexOf(props[k]) !== -1) {
      formDate = k.replace('FORM_ID_', '');
      break;
    }
  }

  var payload = {
    responseId: response.getId(),
    submittedAt: response.getTimestamp().toISOString(),
    doneRaw: doneCodes,
    remarksRaw: remarks,
    date: formDate
  };
  return payload;
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
  Object.keys(all).forEach(function (key) {
    if (key.indexOf('PENDING_') !== 0) { return; }
    if (postToN8n_(JSON.parse(all[key]))) {
      props.deleteProperty(key);
    }
  });
}

function prop_(key) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  return v === null || v === undefined || v === '' ? '' : v;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
