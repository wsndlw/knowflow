export default function LoginPage() {
  return (
    <section className="login-surface">
      <div className="login-panel">
        <div className="page-heading">
          <p className="eyebrow">账号登录</p>
          <h1>进入 Knowflow</h1>
        </div>
        <form className="login-form">
          <label>
            用户名
            <input name="username" autoComplete="username" placeholder="admin" />
          </label>
          <label>
            密码
            <input name="password" type="password" autoComplete="current-password" />
          </label>
          <button type="button">登录</button>
        </form>
      </div>
    </section>
  );
}
