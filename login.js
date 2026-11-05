(function () {
  // Google login is switched on
  const GOOGLE_LOGIN = true;

  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const showLoginBtn = document.getElementById('showLogin');
  const showSignupBtn = document.getElementById('showSignup');
  const googleBtn = document.getElementById('googleBtn');

  function setShown(element, shown, displayWhenShown) {
    element.classList.toggle('hidden', !shown);
    element.style.display = shown ? (displayWhenShown || '') : 'none';
  }

  // ---------- ERRORS SENT BACK BY GOOGLE / SUPABASE ----------
  // When Google login fails, the reason is in the address bar. Show it on the page.
  function showReturnedError() {
    const fromQuery = new URLSearchParams(location.search);
    const fromHash = new URLSearchParams(location.hash.replace(/^#/, ''));

    const message =
      fromQuery.get('error_description') || fromHash.get('error_description') ||
      fromQuery.get('error') || fromHash.get('error');

    if (message) {
      document.getElementById('loginError').textContent = 'Google login problem: ' + message;
    }
  }

  // ---------- WHERE TO GO AFTER LOGGING IN ----------
  // The shop sends us here with ?next=index.html?checkout=1
  // Only simple page names are allowed.
  function readNextPage() {
    let next = new URLSearchParams(location.search).get('next');

    if (next) {
      try { localStorage.setItem('madallaNext', next); } catch (e) {}
    } else {
      try { next = localStorage.getItem('madallaNext'); } catch (e) {}
    }

    const safe = /^[A-Za-z0-9_\-]+\.html(\?[A-Za-z0-9_=&\-]*)?$/;
    return safe.test(next || '') ? next : 'index.html';
  }

  const nextPage = readNextPage();

  function goNext() {
    try { localStorage.removeItem('madallaNext'); } catch (e) {}
    location.href = nextPage;
  }

  if (new URLSearchParams(location.search).get('need')) {
    setShown(document.getElementById('needNotice'), true);
  }

  // ---------- LOG IN / CREATE ACCOUNT SWITCH ----------
  function showLoginForm() {
    showLoginBtn.classList.add('active');
    showSignupBtn.classList.remove('active');
    setShown(loginForm, true);
    setShown(signupForm, false);
  }

  function showSignupForm() {
    showSignupBtn.classList.add('active');
    showLoginBtn.classList.remove('active');
    setShown(signupForm, true);
    setShown(loginForm, false);
  }

  showLoginBtn.addEventListener('click', showLoginForm);
  showSignupBtn.addEventListener('click', showSignupForm);
  showLoginForm();
  showReturnedError();

  // ---------- CONTINUE WITH GOOGLE ----------
  if (GOOGLE_LOGIN) {
    setShown(googleBtn, true, 'block');
    setShown(document.getElementById('orText'), true, 'block');

    googleBtn.addEventListener('click', async function () {
      document.getElementById('loginError').textContent = '';

      const { error } = await db.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + location.pathname }
      });
      if (error) {
        document.getElementById('loginError').textContent = 'Could not start Google login: ' + error.message;
      }
    });
  }

  // ---------- LOG IN ----------
  loginForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    document.getElementById('loginError').textContent = '';

    const { error } = await db.auth.signInWithPassword({
      email: document.getElementById('loginEmail').value.trim(),
      password: document.getElementById('loginPassword').value
    });

    if (error) {
      document.getElementById('loginError').textContent = 'Could not log in: ' + error.message;
      return;
    }

    goNext();
  });

  // ---------- CREATE ACCOUNT ----------
  signupForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    const errorBox = document.getElementById('signupError');
    errorBox.textContent = '';

    const name = document.getElementById('signupName').value.trim();
    const phone = document.getElementById('signupPhone').value.trim();
    const digits = phone.replace(/\D/g, '');

    if (name.length < 2) {
      errorBox.textContent = 'Please enter your full name.';
      return;
    }
    if (digits.length < 10 || digits.length > 15) {
      errorBox.textContent = 'Please enter a valid phone number.';
      return;
    }

    const { data, error } = await db.auth.signUp({
      email: document.getElementById('signupEmail').value.trim(),
      password: document.getElementById('signupPassword').value,
      options: { data: { full_name: name, phone: phone } }
    });

    if (error) {
      errorBox.textContent = 'Could not create the account: ' + error.message;
      return;
    }

    if (data.session) {
      goNext();
    } else {
      errorBox.textContent = 'Account created. Please check your email to confirm it, then log in.';
    }
  });

  // ---------- ALREADY LOGGED IN (or just came back from Google) ----------
  // Moves on as soon as a login is picked up, however it arrives
  db.auth.onAuthStateChange(function (event, session) {
    if (event === 'SIGNED_IN' && session) goNext();
  });

  (async function start() {
    const { data } = await db.auth.getSession();
    if (data.session) goNext();
  })();
})();