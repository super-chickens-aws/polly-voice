import { useState } from "react";
import { Link } from "react-router-dom";

import {
  register,
  confirmRegister,
} from "../services/auth";

export default function Register() {

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [verify, setVerify] = useState(false);

  async function handleRegister() {
    try {
      await register(
    displayName,
    email,
    password
);
      alert("Đã gửi mã xác thực tới email.");
      setVerify(true);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleConfirm() {
    try {
      await confirmRegister(email, code);
      alert("Đăng ký thành công.");
    } catch (err) {
      console.error(err);
    }
  }

  if (verify) {
    return (
      <div>
        <h2>Verify Email</h2>
        <input
          placeholder="Code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <br /><br />

        <button onClick={handleConfirm}>
          Verify
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2>Register</h2>
      <input
        placeholder="Display Name"
        value={displayName}
        onChange={(e)=>setDisplayName(e.target.value)}
      />

      <br /><br />
      
      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <br /><br />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <br /><br />

      <button onClick={handleRegister}>
        Register
      </button>

      <br /><br />

      <Link to="/">
        Login
      </Link>
    </div>
  );
}