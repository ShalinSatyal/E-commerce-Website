const express = require("express");
const path = require("path");
const dotenv = require("dotenv");

const db = require("./db");

const authRoutes = require("./routes/auth");
const orderRoutes = require("./routes/orders");

dotenv.config();

const app = express();

const PORT =
    process.env.PORT || 3000;


// ======================================================
// MIDDLEWARE
// ======================================================

app.use(express.json());


// ======================================================
// API ROUTES
// ======================================================

app.use(
    "/api/auth",
    authRoutes
);

app.use(
    "/api/orders",
    orderRoutes
);


// ======================================================
// FRONTEND
// ======================================================

app.use(
    express.static(
        path.join(__dirname, "../public")
    )
);


// ======================================================
// HOME PAGE
// ======================================================

app.get("/", function(req, res) {

    res.sendFile(
        path.join(
            __dirname,
            "../public/index.html"
        )
    );

});


// ======================================================
// TEST DATABASE
// ======================================================

app.get(
    "/api/test-db",
    async function(req, res) {

        try {

            const [result] =
                await db.execute(
                    "SELECT 1 AS result"
                );


            res.json({
                success: true,
                message: "MySQL connection is working.",
                result: result
            });

        }

        catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message: "MySQL connection failed."
            });

        }

    }
);


// ======================================================
// START SERVER
// ======================================================

app.listen(
    PORT,
    function() {

        console.log(
            "========================================"
        );

        console.log(
            "SRS Fashion Store backend is running"
        );

        console.log(
            `http://localhost:${PORT}`
        );

        console.log(
            "========================================"
        );

    }
);