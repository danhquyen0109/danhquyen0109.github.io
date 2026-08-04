// =============================================================================
// app.js — khởi động ứng dụng, cổng đăng nhập, khung sidebar
// =============================================================================

import { qs, toastOk, toastErr, openModal } from './ui.js';
import * as db from './db.js';
import { startRouter } from './router.js';

const boot   = qs('#boot');
const authEl = qs('#auth');
const appEl  = qs('#app');

/* ----------------------------- Chuyển màn hình ---------------------------- */

function show(which) {
  boot.hidden   = which !== 'boot';
  authEl.hidden = which !== 'auth';
  appEl.hidden  = which !== 'app';
}

function showConfigNeeded() {
  show('boot');
  boot.innerHTML = `
    <div class="card" style="max-width:520px;text-align:left">
      <div class="card-head"><h2>Chưa cấu hình Supabase</h2></div>
      <p style="color:var(--muted);line-height:1.7;margin-bottom:14px">
        Mở file <code class="mono">affiliate/config.js</code> và điền
        <code class="mono">SUPABASE_URL</code> cùng
        <code class="mono">SUPABASE_ANON_KEY</code>.
      </p>
      <p style="color:var(--muted);line-height:1.7">
        Hai giá trị này lấy ở Supabase Dashboard →
        <strong>Project Settings → Data API</strong>.
        Các bước đầy đủ nằm trong <code class="mono">SETUP.md</code>.
      </p>
    </div>`;
}

/* -------------------------------- Đăng nhập -------------------------------- */

function wireLogin() {
  const form    = qs('#login-form');
  const errBox  = qs('#auth-error');
  const btn     = qs('#login-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Đang đăng nhập…';

    const fd = new FormData(form);
    try {
      const user = await db.signIn(fd.get('email').trim(), fd.get('password'));
      form.reset();
      await enterApp(user);
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Đăng nhập';
    }
  });

  qs('#forgot-btn').addEventListener('click', async () => {
    const email = qs('input[name=email]', form).value.trim();
    if (!email) {
      errBox.textContent = 'Nhập email vào ô ở trên trước đã, rồi bấm lại.';
      errBox.hidden = false;
      return;
    }
    try {
      await db.sendPasswordReset(email);
      toastOk('Đã gửi email đặt lại mật khẩu. Kiểm tra hộp thư.');
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
    }
  });
}

/* -------------------------- Khung ứng dụng chính -------------------------- */

async function enterApp(user) {
  db.session.user = user;
  qs('#who-mail').textContent = user.email ?? '—';
  qs('#who-mail').title = user.email ?? '';
  qs('#who-avatar').textContent = (user.email ?? '?').charAt(0);
  show('app');
  await startRouter();
}

function wireShell() {
  qs('#logout-btn').addEventListener('click', async () => {
    await db.signOut();
    show('auth');
    qs('#view').innerHTML = '';
  });

  const sidebar = qs('#sidebar');
  const scrim   = qs('#scrim');

  qs('#menu-btn').addEventListener('click', () => {
    sidebar.classList.add('open');
    scrim.hidden = false;
  });
  scrim.addEventListener('click', () => {
    sidebar.classList.remove('open');
    scrim.hidden = true;
  });
}

/* ------------------------ Đặt lại mật khẩu qua email ----------------------- */

function promptNewPassword() {
  const m = openModal({
    title: 'Đặt mật khẩu mới',
    size: 'sm',
    body: `
      <label class="field">
        <span>Mật khẩu mới</span>
        <input type="password" id="np" minlength="8" placeholder="Ít nhất 8 ký tự">
      </label>
      <div class="auth-error" id="np-err" hidden></div>`,
    footer: `<button class="btn" id="np-save">Lưu mật khẩu</button>`,
  });

  qs('#np-save', m.root).addEventListener('click', async () => {
    const val = qs('#np', m.root).value;
    const err = qs('#np-err', m.root);
    if (val.length < 8) {
      err.textContent = 'Mật khẩu phải từ 8 ký tự trở lên.';
      err.hidden = false;
      return;
    }
    try {
      await db.updatePassword(val);
      m.close();
      toastOk('Đã đổi mật khẩu.');
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
    }
  });
}

/* --------------------------------- Khởi động ------------------------------- */

async function main() {
  if (!db.isConfigured()) return showConfigNeeded();

  wireLogin();
  wireShell();

  db.sb.auth.onAuthStateChange((event, s) => {
    if (event === 'SIGNED_OUT') {
      db.session.user = null;
      show('auth');
    } else if (event === 'PASSWORD_RECOVERY') {
      promptNewPassword();
    } else if (s?.user) {
      db.session.user = s.user;
    }
  });

  try {
    const user = await db.currentUser();
    if (user) await enterApp(user);
    else show('auth');
  } catch (err) {
    console.error(err);
    toastErr(err.message);
    show('auth');
  }
}

main();
