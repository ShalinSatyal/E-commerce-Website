const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const db = require("../db");

const router = express.Router();


// ======================================================
// REGISTER CUSTOMER
// ======================================================

router.post("/register", async function(req, res) {

    try {

        const {
            name,
            email,
            password
        } = req.body;


        if (!name || !email || !password) {

            return res.status(400).json({
                message: "Name, email and password are required."
            });

        }


        if (password.length < 6) {

            return res.status(400).json({
                message: "Password must be at least 6 characters."
            });

        }


        const [existingUsers] = await db.execute(
            "SELECT id FROM users WHERE email = ?",
            [email]
        );


        if (existingUsers.length > 0) {

            return res.status(409).json({
                message: "An account with this email already exists."
            });

        }


        const hashedPassword =
            await bcrypt.hash(password, 10);


        await db.execute(
            `INSERT INTO users
            (name, email, password, role)
            VALUES (?, ?, ?, 'customer')`,
            [
                name,
                email,
                hashedPassword
            ]
        );


        res.status(201).json({
            message: "Registration successful."
        });

    }

    catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Server error during registration."
        });

    }

});


// ======================================================
// LOGIN
// ======================================================

router.post("/login", async function(req, res) {

    try {

        const {
            email,
            password
        } = req.body;


        if (!email || !password) {

            return res.status(400).json({
                message: "Email and password are required."
            });

        }


        const [users] = await db.execute(
            "SELECT * FROM users WHERE email = ?",
            [email]
        );


        if (users.length === 0) {

            return res.status(401).json({
                message: "Invalid email or password."
            });

        }


        const user = users[0];


        const passwordCorrect =
            await bcrypt.compare(
                password,
                user.password
            );


        if (!passwordCorrect) {

            return res.status(401).json({
                message: "Invalid email or password."
            });

        }


        const token =
            jwt.sign(
                {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                },
                process.env.JWT_SECRET,
                {
                    expiresIn: "1d"
                }
            );


        res.json({

            message: "Login successful.",

            token: token,

            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }

        });

    }

    catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Server error during login."
        });

    }

});


module.exports = router;