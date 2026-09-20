/**
 * FormBridge.gs - connects the Senior Authority Google Form to n8n.
 *
 * Install: open the Google Form -> three-dot menu -> Script editor -> paste this
 * whole file -> set the Script Properties listed below -> run setup() once ->
 * Deploy as a Web app (see integrations/README.md).
 *
 * Two jobs:
 *   1. doPost()        n8n calls this every morning with today's task list; the
 *                      form's checkbox question is rebuilt to match.
 *   2. onFormSubmit_() fires when the Senior Authority submits the form and
 *                      forwards the answers to the n8n webhook, which updates
 *                      the Swift Senior Checklist app.
 *
 * Script Properties (Project Settings -> Script Properties):
 *   BRIDGE_SECRET       any long random string. n8n sends it when rebuilding the form.
 *   N8N_WEBHOOK_URL     n8n PRODUCTION URL, e.g. https://your-n8n/webhook/swift-form-submitted
 *   N8N_WEBHOOK_SECRET  any long random string. Must equal the value in the n8n
 *                       "Swift Form Webhook Secret" credential.
 * Set automatically: FORM_ID, FORM_DATE.
 */

var DONE_TITLE = 'Tick every task that is DONE today';
var REMARKS_TITLE = 'Remarks for anything NOT done';
var CLEAR_RESPONSES_ON_REFRESH = true; // the app keeps the history, the form need not

// ---------------------------------------------------------------- setup ----

/** Run once from the editor (Run -> setup). Safe to run again. */
function setup() {
  var form = FormApp.getActiveForm();
  if (!form) {
    throw new Error('Open this script from the Google Form (Form editor -> three dots -> Script editor), then run setup again.');
  }

  var props = PropertiesService.getScriptProperties();
  props.setProperty('FORM_ID', form.getId());

  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'onFormSubmit_' || fn === 'retryPending_') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('onFormSubmit_').forForm(form).onFormSubmit().create();
  ScriptApp.newTrigger('retryPending_').timeBased().everyMinutes(15).create();

  form.setCollectEmail(false);

  var missing = ['BRIDGE_SECRET', 'N8N_WEBHOOK_URL', 'N8N_WEBHOOK_SECRET'].filter(function (k) {
    return !prop_(k);
  });
  Logger.log(missing.length
    ? 'Setup done, but these Script Properties are still missing: ' + missing.join(', ')
    : 'Setup done. Triggers installed. Now deploy as a Web app.');
}

// ------------------------------------------------- 1. n8n -> rebuild form ----

/** Web app entry point. n8n POSTs JSON: { secret, action: 'refresh', date, choices: [...] } */
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

  var form = FormApp.openById(prop_('FORM_ID'));
  form.setTitle('Senior Authority Daily Checklist - ' + body.date);
  form.setDescription('Tick every task that is DONE. For anything not done, add a line in the remarks box: CHECKLIST-CODE: reason');

  form.getItems().forEach(function (item) { form.deleteItem(item); });
  if (CLEAR_RESPONSES_ON_REFRESH) {
    form.deleteAllResponses();
  }

  form.addCheckboxItem()
    .setTitle(DONE_TITLE)
    .setChoiceValues(choices)
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle(REMARKS_TITLE)
    .setHelpText('One line per task, format:  CHECKLIST-CODE: your remark   (e.g.  CL-20260920-YT001: waiting on HR)')
    .setRequired(false);

  form.setAcceptingResponses(true);
  PropertiesService.getScriptProperties().setProperty('FORM_DATE', String(body.date || ''));

  return { ok: true, date: body.date, count: choices.length, formUrl: form.getPublishedUrl() };
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

  var payload = {
    responseId: response.getId(),
    submittedAt: response.getTimestamp().toISOString(),
    doneRaw: doneCodes,
    remarksRaw: remarks
  };
  var date = prop_('FORM_DATE');
  if (date) { payload.date = date; }
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

// -------------------------------------------------------------- helpers ----

/** Handy for testing: re-sends the most recent form response through n8n. */
function resendLastResponse() {
  var form = FormApp.openById(prop_('FORM_ID'));
  var responses = form.getResponses();
  if (!responses.length) { Logger.log('No responses yet.'); return; }
  var ok = postToN8n_(buildPayload_(responses[responses.length - 1]));
  Logger.log(ok ? 'Sent.' : 'Failed - see Executions log.');
}

function prop_(key) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  return v === null || v === undefined || v === '' ? '' : v;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
