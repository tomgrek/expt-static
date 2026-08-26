/* ==========================================================================
   physbox.io - Contact form
   --------------------------------------------------------------------------
   Posts contact.html's form to POST /api/contact, which relays it to the
   PhysBox inbox over Gmail's SMTP.

   The API base comes from PhysBoxAuth rather than a literal, so this follows
   the same localhost/deployed resolution as every other call the site makes -
   including the rule that a page served on port 3000 must not resolve the API
   to itself.

   No token is attached, and none is expected: the whole point of a contact
   form is that someone without an account can use it. A signed-in visitor does
   get their name and address prefilled, since re-typing them is pure friction.
   ========================================================================== */

(function () {
  'use strict';

  var form = document.getElementById('contact-form');
  if (!form) return;

  var nameEl = document.getElementById('contact-name');
  var emailEl = document.getElementById('contact-email');
  var subjectEl = document.getElementById('contact-subject');
  var messageEl = document.getElementById('contact-message');
  var companyEl = document.getElementById('contact-company');
  var countEl = document.getElementById('contact-count');
  var submitEl = document.getElementById('contact-submit');
  var statusEl = document.getElementById('contact-status');

  var SUBMIT_IDLE = '<i class="fas fa-paper-plane"></i> Send message';

  /**
   * Where to send people if the form itself cannot deliver.
   *
   * Deliberately not a mailto: publishing the destination address on a public
   * page is how it ends up scraped, and routing everything through this form is
   * the reason the address stays private. GitHub is the fallback instead - it
   * is already public, already the right place for anything bug-shaped, and
   * needs no address from us.
   */
  var FALLBACK_HTML =
    ' In the meantime you can reach us via <a href="https://github.com/physbox-io" target="_blank">GitHub</a>.';

  function apiBase() {
    if (window.PhysBoxAuth && window.PhysBoxAuth.getApiBaseUrl) {
      return window.PhysBoxAuth.getApiBaseUrl();
    }
    return 'https://api.physbox.io';
  }

  function setStatus(kind, html) {
    statusEl.className = 'contact-status is-visible is-' + kind;
    statusEl.innerHTML = html;
  }

  function clearStatus() {
    statusEl.className = 'contact-status';
    statusEl.innerHTML = '';
  }

  function setBusy(busy) {
    submitEl.disabled = busy;
    submitEl.innerHTML = busy
      ? '<i class="fas fa-spinner fa-spin"></i> Sending&hellip;'
      : SUBMIT_IDLE;
  }

  function failure(text) {
    setStatus('error', text + FALLBACK_HTML);
  }

  // Live character count, so hitting the 5000-character ceiling is visible
  // before the server is the one to mention it.
  if (messageEl && countEl) {
    messageEl.addEventListener('input', function () {
      countEl.textContent = String(messageEl.value.length);
    });
  }

  // Prefill from the stored session when there is one.
  (function prefill() {
    if (!window.PhysBoxAuth || !window.PhysBoxAuth.getStoredUser) return;
    var user = window.PhysBoxAuth.getStoredUser();
    if (!user) return;
    if (user.name && !nameEl.value) nameEl.value = user.name;
    if (user.email && !emailEl.value) emailEl.value = user.email;
  })();

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearStatus();

    var payload = {
      name: nameEl.value.trim(),
      email: emailEl.value.trim(),
      subject: subjectEl.value,
      message: messageEl.value.trim(),
      company: companyEl ? companyEl.value : ''
    };

    // Checked here as well as on the server. The server's copy is the one that
    // matters; this one just avoids a round trip to be told something obvious.
    if (!payload.name || !payload.email || !payload.message) {
      setStatus('error', 'Please fill in your name, your email, and a message.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      setStatus('error', 'That email address does not look right — we would have no way to reply.');
      emailEl.focus();
      return;
    }

    setBusy(true);

    fetch(apiBase() + '/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        return response
          .json()
          .catch(function () { return {}; })
          .then(function (body) { return { ok: response.ok, status: response.status, body: body }; });
      })
      .then(function (result) {
        if (result.ok && result.body.success) {
          form.reset();
          if (countEl) countEl.textContent = '0';
          setStatus(
            'success',
            '<strong>Message sent.</strong> Thanks &mdash; we read everything that comes through here and will reply to the address you gave.'
          );
          return;
        }

        if (result.status === 429) {
          setStatus('error', 'That is a lot of messages in one hour. Please give it a little while.');
          return;
        }

        // 400 comes back with a specific, safe-to-show reason; anything else
        // gets the generic line plus the GitHub fallback.
        if (result.status === 400 && result.body.error) {
          setStatus('error', result.body.error);
          return;
        }

        failure(result.body.error || 'Something went wrong sending that message.');
      })
      .catch(function () {
        // Network-level failure: offline, DNS, or CORS. Nothing was sent.
        failure('We could not reach the server, so that message was not sent.');
      })
      .finally(function () {
        setBusy(false);
      });
  });
})();
