import { getUser, createUser } from "./src/services/userService.js";

export const handler = async (event) => {

    const claims = event.requestContext.authorizer.jwt.claims;

    const userId = claims.sub;
    const email = claims.email;

    let user = await getUser(userId);

    if (!user) {

        user = {

            userId,

            email,

            displayName: "",

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

};