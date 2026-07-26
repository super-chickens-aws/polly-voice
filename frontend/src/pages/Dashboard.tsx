import { useEffect, useState } from "react";
import { hello } from "../services/api";
import { logout } from "../services/auth";
import { useNavigate } from "react-router-dom";
function Dashboard() {
  const [message, setMessage] = useState("");

  const navigate = useNavigate();

  async function handleLogout() {

    await logout();

    navigate("/");

}

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const data = await hello();
      setMessage(data.message);
    } catch (err) {
      setMessage("Cannot call API");
    }
  }

  return (
    <div style={{ padding: 30 }}>
      <h1>Dashboard</h1>

      <p>{message}</p>

      <button onClick={handleLogout}>
    Logout
</button>
    </div>
  );

  

}

export default Dashboard;