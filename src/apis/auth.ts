require("dotenv").config();

import { Request, Response, NextFunction } from "express";
import { OAuth2Client } from "google-auth-library";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

import { LoginObject, RegistryObject } from "../interfaces/global";
import controllers from "../controllers";
// import Utils from "../utils";

const googleClient = new OAuth2Client({
    clientId: `${process.env.OAUTH_CLIENTID}`,
});

// Normal Auth
const registry = async (req: Request, res: Response) => {
    try {
        const { name, email, password }: RegistryObject = req.body;

        if (!(email.trim() && password.trim() && name.trim())) {
            return res.status(400).send("Please enter all required data.");
        } // Check user

        const oldUser = await controllers.Auth.find({
            filter: { email: email.toLowerCase().trim() },
        });

        if (oldUser) {
            return res.status(409).send("User Already Exist. Please Login");
        }

        let encryptedPassword = await bcrypt.hash(password, 10); // Encrypt password

        const result = await controllers.Auth.create({
            name: name,
            email: email.toLowerCase().trim(),
            password: encryptedPassword,
        }); // Save user data

        if (result) {
            res.status(200).json({
                success: true,
            });
        } else {
            throw new Error("Server Error");
        }
    } catch (err: any) {
        console.log("create error : ", err.message);
        res.status(500).send(err.message);
    }
};

const login = async (req: Request, res: Response) => {
    try {
        const { email, password }: LoginObject = req.body;

        if (!(email.trim() && password.trim())) {
            return res.status(400).send("Please Enter All Required Data.");
        }

        const user = await controllers.Auth.find({
            filter: { email: email.toLowerCase().trim() },
        });

        if (!user) {
            // User check
            return res.status(404).send("User Not Exist. Please Registry");
        }

        const pass = await bcrypt.compare(password, user.password);

        if (pass) {
            // Password check
            const token = jwt.sign(
                { user_id: user._id, email: email.toLowerCase().trim() },
                String(process.env.TOKEN_KEY),
                {
                    expiresIn: "2h",
                }
            ); // Create token

            res.status(200).json({ token: token });
        } else {
            return res.status(400).send("Password or Username Is Not Correct");
        }
    } catch (err: any) {
        console.log("login error: ", err);
        res.status(500).send(err.message);
    }
};

const passwordreset = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;

        const user = await controllers.Auth.find({ filter: { email: email } });
        if (!user)
            return res.status(400).send("User With Given Email Doesn't Exist");

        let token = await controllers.Token.find({
            filter: { userId: user._id },
        });

        if (!token) {
            token = await controllers.Token.create({
                userId: user._id,
                token: crypto.randomBytes(32).toString("hex"),
            });
        }

        // const link = `${process.env.BASE_URL}/reset/${user._id}/${token.token}`;
        // await Utils.sendEmail(user.email, "Password reset", link);

        res.status(200).send("password reset link sent to your email account");
    } catch (err: any) {
        console.log(err);
        res.status(500).send(err.message);
    }
};

// Gmail Auth
const glogin = async (req: Request, res: Response) => {
    try {
        const { token } = req.body;
        console.log(token);
        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: process.env.OAUTH_CLIENTID,
        });

        const payload = ticket.getPayload();

        var user: any = await controllers.Auth.find({
            filter: { email: payload?.email },
        });

        if (!user) {
            user = await controllers.Auth.create({
                name: payload?.name,
                email: payload?.email,
                password: "",
            });
        }

        const jwtToken = jwt.sign(
            { user_id: user._id, email: payload?.email },
            String(process.env.TOKEN_KEY),
            {
                expiresIn: "2h",
            }
        );

        res.status(200).json({ token: jwtToken });
    } catch (err: any) {
        console.log("glogin error", err.message);
        res.status(500).send(err.message);
    }
};

// Middleware
const middleware = async (req: any, res: Response, next: NextFunction) => {
    try {
        const token = <string>req.headers["authorization"] || "";
        console.log(token);

        jwt.verify(
            token,
            String(process.env.TOKEN_KEY),
            async (err: any, userData: any) => {
                if (err) return res.status(403).end();

                const user: any = await controllers.Auth.find({
                    filter: {
                        email: userData.email,
                    },
                });
                req.user = user; // Save user data

                next();
            }
        );
    } catch (err: any) {
        console.log(err.message);
        res.status(401).end();
    }
};

export default {
    login,
    registry,
    passwordreset,
    glogin,
    middleware,
};
