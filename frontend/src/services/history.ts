import { API_URL } from "../config";
import { fetchAuthSession } from "aws-amplify/auth";

export async function getHistory() {
    const session = await fetchAuthSession();

    const token =
        session.tokens?.accessToken?.toString();

    const response = await fetch(
        `${API_URL}/history`,
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

    if (!response.ok) {
        throw new Error("Cannot load history");
    }

    return response.json();
}