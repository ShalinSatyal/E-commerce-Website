const express = require("express");
const crypto = require("crypto");
const pool = require("../db");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();


// =====================================================
// 1. GENERATE ESEWA HMAC-SHA256 SIGNATUREt
// =====================================================

function generateSignature(message) {
    return crypto
        .createHmac("sha256", process.env.ESEWA_SECRET_KEY)
        .update(message)
        .digest("base64");
}


// =====================================================
// 2. START ESEWA PAYMENT
// =====================================================

router.post("/initiate", authenticateToken, async function(req, res) {

    try {

        const {
            customerName,
            phone,
            address,
            city,
            items
        } = req.body;


        // Basic validation
        if (
            !customerName ||
            !phone ||
            !address ||
            !city ||
            !Array.isArray(items) ||
            items.length === 0
        ) {
            return res.status(400).json({
                message: "Missing checkout information."
            });
        }


        // -------------------------------------------------
        // Calculate total
        // -------------------------------------------------

        let totalAmount = 0;

        for (const item of items) {

            const price = Number(item.price);
            const quantity = Number(item.quantity);

            if (
                !Number.isFinite(price) ||
                !Number.isFinite(quantity) ||
                price <= 0 ||
                quantity <= 0
            ) {
                return res.status(400).json({
                    message: "Invalid product information."
                });
            }

            totalAmount += price * quantity;
        }


        totalAmount = Number(totalAmount.toFixed(2));


        // -------------------------------------------------
        // Generate unique transaction UUID
        // -------------------------------------------------

        const transactionUuid = "SRS-" + Date.now();


        // -------------------------------------------------
        // Create order number
        // -------------------------------------------------

        const orderNumber = transactionUuid;


        // -------------------------------------------------
        // Create PENDING order
        // -------------------------------------------------

        const connection = await pool.getConnection();

        try {

            await connection.beginTransaction();


            const [orderResult] = await connection.execute(
                `INSERT INTO orders
                (
                    order_number,
                    user_id,
                    customer_name,
                    phone,
                    address,
                    city,
                    payment_method,
                    total_amount,
                    payment_status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    orderNumber,
                    req.user.id,
                    customerName,
                    phone,
                    address,
                    city,
                    "eSewa",
                    totalAmount,
                    "PENDING"
                ]
            );


            const orderId = orderResult.insertId;


            // -------------------------------------------------
            // Save order items
            // -------------------------------------------------

            for (const item of items) {

                await connection.execute(
                    `INSERT INTO order_items
                    (
                        order_id,
                        product_id,
                        product_name,
                        price,
                        quantity
                    )
                    VALUES (?, ?, ?, ?, ?)`,
                    [
                        orderId,
                        Number(item.productId),
                        item.productName,
                        Number(item.price),
                        Number(item.quantity)
                    ]
                );
            }


            await connection.commit();

            connection.release();


            // -------------------------------------------------
            // eSewa payment values
            // -------------------------------------------------

            const amount = totalAmount;
            const taxAmount = 0;
            const serviceCharge = 0;
            const deliveryCharge = 0;

            const totalPayment =
                amount +
                taxAmount +
                serviceCharge +
                deliveryCharge;


            // -------------------------------------------------
            // Fields that eSewa requires to be signed
            // -------------------------------------------------

            const signedFieldNames =
                "total_amount,transaction_uuid,product_code";


            const message =
                `total_amount=${totalPayment},` +
                `transaction_uuid=${transactionUuid},` +
                `product_code=${process.env.ESEWA_PRODUCT_CODE}`;


            const signature = generateSignature(message);


            // -------------------------------------------------
            // Send payment information to frontend
            // -------------------------------------------------

            res.json({

                success: true,

                paymentUrl:
                    "https://rc-epay.esewa.com.np/api/epay/main/v2/form",

                paymentData: {

                    amount: amount,

                    tax_amount: taxAmount,

                    total_amount: totalPayment,

                    transaction_uuid: transactionUuid,

                    product_code:
                        process.env.ESEWA_PRODUCT_CODE,

                    product_service_charge:
                        serviceCharge,

                    product_delivery_charge:
                        deliveryCharge,

                    success_url:
                        "http://localhost:3000/api/esewa/success",

                    failure_url:
                        "http://localhost:3000/api/esewa/failure",

                    signed_field_names:
                        signedFieldNames,

                    signature:
                        signature
                }

            });


        } catch (error) {

            await connection.rollback();

            connection.release();

            throw error;
        }


    } catch (error) {

        console.error("eSewa initiate error:", error);

        res.status(500).json({
            message: "Could not start eSewa payment."
        });
    }

});


// =====================================================
// 3. ESEWA SUCCESS CALLBACK
// =====================================================

router.get("/success", async function(req, res) {

    try {

        const encodedData = req.query.data;

        if (!encodedData) {

            return res.redirect(
                "/payment-failed.html?reason=missing-data"
            );
        }


        // Decode Base64 response
        const decodedData =
            Buffer.from(
                encodedData,
                "base64"
            ).toString("utf8");


        const paymentData =
            JSON.parse(decodedData);


        console.log(
            "eSewa response:",
            paymentData
        );


        // -------------------------------------------------
        // Verify response signature
        // -------------------------------------------------

        const signedFieldNames =
            paymentData.signed_field_names;


        const fields =
            signedFieldNames.split(",");


        const message =
            fields
                .map(function(field) {

                    return `${field}=${paymentData[field]}`;

                })
                .join(",");


        const expectedSignature =
            generateSignature(message);


        if (
            expectedSignature !==
            paymentData.signature
        ) {

            console.log(
                "eSewa signature verification failed."
            );

            return res.redirect(
                "/payment-failed.html?reason=invalid-signature"
            );
        }


        // -------------------------------------------------
        // Check basic payment information
        // -------------------------------------------------

        if (
            paymentData.status !== "COMPLETE"
        ) {

            return res.redirect(
                "/payment-failed.html?reason=payment-not-complete"
            );
        }


        const transactionUuid =
            paymentData.transaction_uuid;


        const totalAmount =
            Number(paymentData.total_amount);


        // -------------------------------------------------
        // Find the order
        // -------------------------------------------------

        const [orders] = await pool.execute(
            `SELECT *
             FROM orders
             WHERE order_number = ?
             LIMIT 1`,
            [transactionUuid]
        );


        if (orders.length === 0) {

            return res.redirect(
                "/payment-failed.html?reason=order-not-found"
            );
        }


        const order = orders[0];


        // -------------------------------------------------
        // Check amount
        // -------------------------------------------------

        if (
            Number(order.total_amount) !==
            totalAmount
        ) {

            console.log(
                "Amount mismatch:",
                order.total_amount,
                totalAmount
            );

            return res.redirect(
                "/payment-failed.html?reason=amount-mismatch"
            );
        }


        // -------------------------------------------------
        // Ask eSewa for transaction status
        // -------------------------------------------------
        
const statusUrl =
    "https://rc.esewa.com.np/api/epay/transaction/status/" +
    `?product_code=${encodeURIComponent(
        process.env.ESEWA_PRODUCT_CODE
    )}` +
    `&total_amount=${encodeURIComponent(
        totalAmount
    )}` +
    `&transaction_uuid=${encodeURIComponent(
        transactionUuid
    )}`;


        const statusResponse =
            await fetch(statusUrl);


        if (!statusResponse.ok) {

            console.log(
                "eSewa status API error:",
                statusResponse.status
            );

            return res.redirect(
                "/payment-failed.html?reason=verification-error"
            );
        }


        const statusData =
            await statusResponse.json();


        console.log(
            "eSewa status:",
            statusData
        );


        // -------------------------------------------------
        // FINAL PAYMENT CHECK
        // -------------------------------------------------

        if (
            statusData.status !== "COMPLETE"
        ) {

            await pool.execute(
                `UPDATE orders
                 SET payment_status = ?
                 WHERE id = ?`,
                [
                    statusData.status || "FAILED",
                    order.id
                ]
            );


            return res.redirect(
                "/payment-failed.html?reason=payment-not-complete"
            );
        }


        // -------------------------------------------------
        // PAYMENT SUCCESSFUL
        // -------------------------------------------------

        await pool.execute(
            `UPDATE orders
             SET
                payment_status = ?,
                transaction_id = ?
             WHERE id = ?`,
            [
                "PAID",
                statusData.refId ||
                statusData.ref_id ||
                paymentData.transaction_code,
                order.id
            ]
        );


        // -------------------------------------------------
        // Redirect customer
        // -------------------------------------------------

        res.redirect(
            `/payment-success.html?order=${encodeURIComponent(
                order.order_number
            )}`
        );


    } catch (error) {

        console.error(
            "eSewa success error:",
            error
        );

        res.redirect(
            "/payment-failed.html?reason=server-error"
        );
    }

});


// =====================================================
// 4. ESEWA FAILURE CALLBACK
// =====================================================

router.get("/failure", async function(req, res) {

    console.log(
        "eSewa payment failed or was cancelled."
    );

    res.redirect(
        "/payment-failed.html?reason=cancelled"
    );
});


module.exports = router;