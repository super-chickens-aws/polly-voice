import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

import { login, isAuthenticated } from "../services/auth";

export default function Login() {

    const navigate = useNavigate();

    const [email, setEmail] = useState("");

    const [password, setPassword] = useState("");

    async function handleLogin() {

        try {

            await login(email, password);

            alert("Login Success");

            navigate("/dashboard");

        } catch (error) {

            console.error(error);

            alert("Login Failed");

        }

    }

    useEffect(() => {

        check();

    }, []);

    async function check() {

        const ok = await isAuthenticated();

        if (ok) {

            navigate("/dashboard");

        }

    }

    return (

        <div>

            <h2>Login</h2>

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

            <button onClick={handleLogin}>

                Login

            </button>

            <br /><br />

            <Link to="/register">

                Register

            </Link>

        </div>

    );

}