import { Navigate } from "react-router-dom";
import { isAuthenticated } from "../services/auth";
import { useEffect, useState } from "react";

type Props = {
    children: React.ReactNode;
};

export default function ProtectedRoute({ children }: Props) {
    const [loading, setLoading] = useState(true);
    const [login, setLogin] = useState(false);

    useEffect(() => {
        check();
    }, []);

    async function check() {
        const ok = await isAuthenticated();
        setLogin(ok);
        setLoading(false);
    }

    if (loading) {
        return <h3>Loading...</h3>;
    }

    return login ? children : <Navigate to="/" replace />;
}