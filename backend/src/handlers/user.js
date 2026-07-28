import { createUser, getUser } from "../services/index.js";

export async function profileHandler(claims) {
    const userId = claims.sub;
    const email = claims.email;
    const displayName = claims.name;
    let user = await getUser(userId);

    if (!user) {
        user = {
            userId,
            email,
            displayName,
            avatar: "",
            role: "USER",
            createdAt: new Date().toISOString()
        };

        await createUser(user);
    }

    return {
        statusCode: 200,
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(user)
    };
}