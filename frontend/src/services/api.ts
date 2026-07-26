import { API_URL } from "../config";
import { getAccessToken } from "./auth";

export async function hello() {

    const token = await getAccessToken();

    const response = await fetch(
        `${API_URL}/hello`,
        {
            headers:{
                Authorization: `Bearer ${token}`
            }
        }
    );

    if(!response.ok){
        throw new Error("Unauthorized");
    }

    return response.json();
}