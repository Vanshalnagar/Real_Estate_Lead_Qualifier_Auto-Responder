/**
 * NESTR. — Google Apps Script bound to the "NESTR Leads" spreadsheet.
 *
 *  onFormSubmit(e)  installable trigger on the Google Form → posts the response to the n8n
 *                   "lead-intake" webhook (falls back to the backend mirror URL if n8n fails).
 *  doPost(e)        web app endpoint used by n8n and the backend:
 *                     { action: "upsertLead",   leadId, row }                → append/update the lead row
 *                     { action: "notifyBroker", leadId, broker, brief, … }   → MailApp email to the broker
 *                     { action: "emailCustomer", leadId, to, subject, body } → confirmation email
 *                     { action: "ping" }                                     → health check
 *                   Secured with a shared token (?token=… query param, or "token" in the body),
 *                   compared against the SHEETS_WEBHOOK_TOKEN script property.
 *  notifyBroker(lead)  MailApp email for high-urgency leads.
 *
 * Script properties (Project Settings → Script properties) — never hard-code secrets here:
 *   SHEETS_WEBHOOK_TOKEN   same value as SHEETS_WEBHOOK_TOKEN in backend/.env
 *   N8N_WEBHOOK_URL        https://<public-n8n-host>/webhook/lead-intake
 *   INTERNAL_API_SECRET    same value as INTERNAL_API_SECRET in backend/.env (n8n webhook header auth)
 *   BACKEND_FORM_URL       optional fallback: https://<public-backend>/api/webhooks/google-form
 *   LEADS_SHEET_NAME       optional, defaults to "Leads"
 */

var HEADERS = [
  'Timestamp', 'Lead ID', 'Channel', 'Name', 'Phone', 'Email', 'Intent', 'Urgency', 'Score', 'Location',
  'Budget', 'Timeline', 'Requirements', 'Summary', 'Auto-Response', 'Status', 'Assigned Broker',
];

function props_() {
  return PropertiesService.getScriptProperties();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function leadsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = props_().getProperty('LEADS_SHEET_NAME') || 'Leads';
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#ffffff');
  }
  return sh;
}

/** Constant-time-ish comparison for the shared token. */
function tokenOk_(given) {
  var expected = props_().getProperty('SHEETS_WEBHOOK_TOKEN') || '';
  if (!expected || !given || given.length !== expected.length) return false;
  var diff = 0;
  for (var i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

// ------------------------------------------------------------------------------------------------
// Google Form → n8n
// ------------------------------------------------------------------------------------------------

/** Installable "On form submit" trigger (from the spreadsheet linked to the form). */
function onFormSubmit(e) {
  var p = props_();
  var payload = {
    source: 'google_form',
    namedValues: e && e.namedValues ? e.namedValues : {},
    timestamp: new Date().toISOString(),
    responseId: e && e.range ? 'row-' + e.range.getRow() : null,
  };
  var body = JSON.stringify(payload);
  var n8nUrl = p.getProperty('N8N_WEBHOOK_URL');
  var secret = p.getProperty('INTERNAL_API_SECRET');
  if (n8nUrl) {
    try {
      var res = UrlFetchApp.fetch(n8nUrl, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'X-Internal-Secret': secret },
        payload: body,
        muteHttpExceptions: true,
      });
      if (res.getResponseCode() < 300) {
        console.log('Form response sent to n8n: ' + res.getResponseCode());
        return;
      }
      console.warn('n8n returned ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
    } catch (err) {
      console.warn('n8n unreachable: ' + err);
    }
  }
  // Fallback: backend mirror route (runs the same pipeline in-process).
  var backendUrl = p.getProperty('BACKEND_FORM_URL');
  if (backendUrl) {
    var r2 = UrlFetchApp.fetch(backendUrl + '?token=' + encodeURIComponent(p.getProperty('SHEETS_WEBHOOK_TOKEN') || ''), {
      method: 'post',
      contentType: 'application/json',
      payload: body,
      muteHttpExceptions: true,
    });
    console.log('Form response sent to backend fallback: ' + r2.getResponseCode());
  }
}

// ------------------------------------------------------------------------------------------------
// Web app (n8n / backend → Sheets + email)
// ------------------------------------------------------------------------------------------------

function doPost(e) {
  var data = {};
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'invalid JSON' });
  }
  var token = (e && e.parameter && e.parameter.token) || data.token;
  if (!tokenOk_(token)) return json_({ ok: false, error: 'unauthorized' });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    switch (data.action) {
      case 'ping':
        return json_({ ok: true, sheet: leadsSheet_().getName() });
      case 'upsertLead':
        return json_(upsertLead_(data.leadId, data.row));
      case 'notifyBroker':
        return json_(notifyBroker(data));
      case 'emailCustomer':
        return json_(emailCustomer_(data));
      default:
        return json_({ ok: false, error: 'unknown action' });
    }
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Appends a new row, or updates the existing row whose "Lead ID" column matches. */
function upsertLead_(leadId, row) {
  if (!leadId || !row || !row.length) return { ok: false, error: 'leadId and row are required' };
  var sh = leadsSheet_();
  var values = row.slice(0, HEADERS.length);
  while (values.length < HEADERS.length) values.push('');
  var last = sh.getLastRow();
  if (last > 1) {
    var ids = sh.getRange(2, 2, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(leadId)) {
        var rowNum = i + 2;
        values[0] = sh.getRange(rowNum, 1).getValue() || values[0]; // keep the original timestamp
        sh.getRange(rowNum, 1, 1, HEADERS.length).setValues([values]);
        return { ok: true, row: rowNum, updated: true };
      }
    }
  }
  sh.appendRow(values);
  var newRow = sh.getLastRow();
  if (String(values[7]).toLowerCase() === 'high') sh.getRange(newRow, 8).setBackground('#ff8a24').setFontColor('#ffffff');
  return { ok: true, row: newRow, updated: false };
}

/** Email to the assigned broker for a high-urgency lead. */
function notifyBroker(lead) {
  if (!lead || !lead.broker || !lead.broker.email) return { ok: false, error: 'broker email missing' };
  var subject = '[NESTR] HIGH urgency lead — respond within 30 minutes';
  var html =
    '<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">' +
    '<p>Hi ' + escape_(lead.broker.name || '') + ',</p>' +
    '<p>A <b style="color:#ff8a24">high-urgency</b> lead has been assigned to you.</p>' +
    '<p style="background:#f6f6f6;padding:12px;border-left:3px solid #ff8a24">' + escape_(lead.brief || '') + '</p>' +
    (lead.adminUrl ? '<p><a href="' + encodeURI(lead.adminUrl) + '">Open the lead in the NESTR admin panel</a></p>' : '') +
    '<p>— NESTR. lead desk (automated)</p></div>';
  MailApp.sendEmail({ to: lead.broker.email, subject: subject, htmlBody: html, name: 'NESTR Lead Desk' });
  return { ok: true };
}

function emailCustomer_(d) {
  if (!d.to) return { ok: false, error: 'recipient missing' };
  MailApp.sendEmail({
    to: d.to,
    subject: d.subject || 'Your property enquiry — NESTR.',
    body: (d.body || '') + '\n\n— NESTR. (this is an automated reply; a broker will follow up)',
    name: 'NESTR.',
  });
  return { ok: true };
}

function escape_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/** Run once from the editor to create the header row and check authorisation scopes. */
function setup() {
  leadsSheet_();
  console.log('Leads sheet ready. Remaining MailApp quota today: ' + MailApp.getRemainingDailyQuota());
}
