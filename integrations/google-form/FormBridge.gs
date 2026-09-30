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
  var choices = body.choices;
  if (!Array.isArray(choices) || !choices.length) {
    return { ok: false, error: 'no_choices' };
  }

  var dateStr = String(body.date || Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd'));
  var employeeName = body.employeeName ? String(body.employeeName).trim() : null;

  // If building a dedicated form for a single employee (e.g. Shaurya Sir):
  var formKey = employeeName
    ? 'FORM_ID_' + dateStr + '_' + employeeName.replace(/[^a-zA-Z0-9]/g, '_')
    : 'FORM_ID_' + dateStr;

  var formTitle = employeeName
    ? 'Daily Checklist — ' + employeeName + ' (' + dateStr + ')'
    : 'Senior Authority Daily Checklist - ' + dateStr;

  var existingFormId = prop_(formKey);
  var form = null;

  // Check if an independent form for this date & employee was already created
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

    // Attach the submit trigger to this independent form
    ScriptApp.newTrigger('onFormSubmit_')
      .forForm(form)
      .onFormSubmit()
      .create();

    PropertiesService.getScriptProperties().setProperty(formKey, form.getId());
    PropertiesService.getScriptProperties().setProperty('FORM_DATE_' + form.getId(), dateStr);
  }

  form.setTitle(formTitle);
  form.setDescription('Tick every task that is completed today (' + dateStr + '). For anything not done, please add a remark below.');

  // Always clear previous questions before populating to keep fresh
  form.getItems().forEach(function (item) { form.deleteItem(item); });

  if (employeeName) {
    // 1. Dedicated single-employee form:
    // Create checkbox choices for tasks, followed by individual task remarks
    var empItem = form.addCheckboxItem();
    empItem.setTitle('📋 Tick Tasks Completed by ' + employeeName + ' (' + choices.length + ')')
      .setChoiceValues(choices)
      .setRequired(false);

    // Individual remarks per task for this employee
    choices.forEach(function (choice) {
      var codeMatch = String(choice).match(/CL-\d{8}-[A-Za-z0-9]+/i);
      var codeStr = codeMatch ? codeMatch[0] : '';
      var cleanTitle = choice.length > 90 ? choice.slice(0, 87) + '...' : choice;
      form.addTextItem()
        .setTitle('💬 Remark for: ' + cleanTitle)
        .setHelpText(codeStr ? 'Optional remark for ' + codeStr + ' if incomplete or pending review' : 'Optional remark for this task')
        .setRequired(false);
    });
  } else if (Array.isArray(body.byEmployee) && body.byEmployee.length > 0) {
    // 2. Multi-employee sectioning with individual task remarks
    body.byEmployee.forEach(function (emp) {
      if (Array.isArray(emp.choices) && emp.choices.length > 0) {
        var groupItem = form.addCheckboxItem();
        groupItem.setTitle('👤 ' + emp.employeeName + ' — Completed Tasks (' + emp.choices.length + ')')
          .setChoiceValues(emp.choices)
          .setRequired(false);

        // Individual remarks per task for each employee
        emp.choices.forEach(function (choice) {
          var codeMatch = String(choice).match(/CL-\d{8}-[A-Za-z0-9]+/i);
          var codeStr = codeMatch ? codeMatch[0] : '';
          var cleanTitle = choice.length > 90 ? choice.slice(0, 87) + '...' : choice;
          form.addTextItem()
            .setTitle('💬 Remark: ' + cleanTitle)
            .setHelpText(codeStr ? 'Optional remark for ' + codeStr : 'Optional remark')
            .setRequired(false);
        });
      }
    });
  } else {
    // Fallback: all choices in one checkbox question
    form.addCheckboxItem()
      .setTitle(DONE_TITLE)
      .setChoiceValues(choices)
      .setRequired(false);

    choices.forEach(function (choice) {
      var codeMatch = String(choice).match(/CL-\d{8}-[A-Za-z0-9]+/i);
      var codeStr = codeMatch ? codeMatch[0] : '';
      form.addTextItem()
        .setTitle('💬 Remark for: ' + (choice.length > 90 ? choice.slice(0, 87) + '...' : choice))
        .setHelpText(codeStr ? 'Optional remark for ' + codeStr : '')
        .setRequired(false);
    });
  }

  // General remarks question for any overall feedback / notes
  form.addParagraphTextItem()
    .setTitle(REMARKS_TITLE)
    .setHelpText('General remarks or notes (e.g. Plant-wide observations, or CL-20260920-XXXX: reason)')
    .setRequired(false);

  form.setAcceptingResponses(true);
  PropertiesService.getScriptProperties().setProperty('FORM_DATE', dateStr);
  PropertiesService.getScriptProperties().setProperty('LATEST_FORM_URL', form.getPublishedUrl());

  return {
    ok: true,
    date: dateStr,
    employeeName: employeeName,
    count: choices.length,
    formId: form.getId(),
    formUrl: form.getPublishedUrl() || form.getEditUrl(),
    publishedUrl: form.getPublishedUrl() || form.getEditUrl()
  };
}

function refreshAllForms_(body) {
  var byEmployee = body.byEmployee;
  if (!Array.isArray(byEmployee) || !byEmployee.length) {
    return { ok: false, error: 'no_employees' };
  }

  var dateStr = String(body.date || Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd'));
  var results = [];

  byEmployee.forEach(function (emp) {
    if (emp.choices && emp.choices.length > 0) {
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
    }
  });

  return {
    ok: true,
    date: dateStr,
    forms: results
  };
}

// --------------------------------------------- 2. form submit -> n8n -> app ---

function onFormSubmit_(e) {
  var payload = buildPayload_(e.response);
  Logger.log('[FormBridge] Received submission for date: ' + payload.date + ', responseId: ' + payload.responseId + ', doneCount: ' + payload.doneRaw.length);
  if (!postToN8n_(payload)) {
    // n8n or the network was down: keep it and retry every 15 minutes.
    PropertiesService.getScriptProperties().setProperty('PENDING_' + payload.responseId, JSON.stringify(payload));
    Logger.log('[FormBridge] Saved to retry queue as PENDING_' + payload.responseId);
  }
}

function buildPayload_(response) {
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
    remarksRaw: finalRemarksText,
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
