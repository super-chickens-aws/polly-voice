import { API_URL } from "../config";
import { fetchAuthSession } from "aws-amplify/auth";

export async function getProfile() {

    const session = await fetchAuthSession();

    const token = session.tokens?.idToken?.toString();

    const response = await fetch(`${API_URL}/auth/profile`, {

        headers: {
            Authorization: `Bearer ${token}`
        }

    });

    if (!response.ok) {
        throw new Error("Cannot get profile");
    }

    return response.json();

}