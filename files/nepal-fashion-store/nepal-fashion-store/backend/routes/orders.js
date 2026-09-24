const express = require("express");

const db = require("../db");

const {
    authenticateToken,
    requireAdmin
} = require("../middleware/auth");

const router = express.Router();


// ======================================================
// CREATE ORDER
// ======================================================

router.post(
    "/",
    authenticateToken,
    async function(req, res) {

        const connection = await db.getConnection();

        try {

            const {
                customerName,
                phone,
                address,
                city,
                paymentMethod,
                items
            } = req.body;


            // Check order information
            if (
                !customerName ||
                !phone ||
                !address ||
                !city ||
                !paymentMethod ||
                !Array.isArray(items) ||
                items.length === 0
            ) {

                return res.status(400).json({
                    message: "Complete order information is required."
                });

            }


            let totalAmount = 0;


            // Check every item
            for (const item of items) {

                const price = Number(item.price);
                const quantity = Number(item.quantity);


                if (
                    !Number.isFinite(price) ||
                    price <= 0 ||
                    !Number.isInteger(quantity) ||
                    quantity <= 0
                ) {

                    console.log("Invalid item received:", item);

                    return res.status(400).json({
                        message: "Invalid order item."
                    });

                }


                // Make sure required product information exists
                if (
                    item.productId === undefined ||
                    item.productId === null ||
                    !item.productName
                ) {

                    console.log("Missing product information:", item);

                    return res.status(400).json({
                        message: "Invalid product information."
                    });

                }


                totalAmount += price * quantity;

            }


            // Generate order number
            const orderNumber =
                "NFS-" + Date.now();


            // Start database transaction
            await connection.beginTransaction();


            // Insert order
            const [orderResult] =
                await connection.execute(
                    `INSERT INTO orders
                    (
                        order_number,
                        user_id,
                        customer_name,
                        phone,
                        address,
                        city,
                        payment_method,
                        total_amount
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        orderNumber,
                        req.user.id,
                        customerName,
                        phone,
                        address,
                        city,
                        paymentMethod,
                        totalAmount
                    ]
                );


            const orderId =
                orderResult.insertId;


            // Insert order items
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
                        item.productId,
                        item.productName,
                        Number(item.price),
                        Number(item.quantity)
                    ]
                );

            }


            // Complete transaction
            await connection.commit();


            // Send success response
            res.status(201).json({

                message:
                    "Order placed successfully.",

                orderNumber:
                    orderNumber,

                total:
                    totalAmount

            });

        }

        catch (error) {

            // Cancel transaction if something goes wrong
            await connection.rollback();

            console.error("CREATE ORDER ERROR:", error);

            res.status(500).json({
                message:
                    "Could not create order."
            });

        }

        finally {

            connection.release();

        }

    }
);


// ======================================================
// CUSTOMER PURCHASE HISTORY
// ======================================================

router.get(
    "/my-orders",
    authenticateToken,
    async function(req, res) {

        try {

            const [orders] =
                await db.execute(
                    `SELECT
                        id,
                        order_number,
                        customer_name,
                        phone,
                        address,
                        city,
                        payment_method,
                        total_amount,
                        created_at
                     FROM orders
                     WHERE user_id = ?
                     ORDER BY created_at DESC`,
                    [req.user.id]
                );


            // Get items for every order
            for (const order of orders) {

                const [items] =
                    await db.execute(
                        `SELECT
                            product_id,
                            product_name,
                            price,
                            quantity
                         FROM order_items
                         WHERE order_id = ?`,
                        [order.id]
                    );


                order.items = items;

            }


            res.json(orders);

        }

        catch (error) {

            console.error(
                "PURCHASE HISTORY ERROR:",
                error
            );

            res.status(500).json({
                message:
                    "Could not load purchase history."
            });

        }

    }
);


// ======================================================
// ADMIN - ALL ORDERS
// ======================================================

router.get(
    "/all",
    authenticateToken,
    requireAdmin,
    async function(req, res) {

        try {

            const [orders] =
                await db.execute(
                    `SELECT
                        orders.id,
                        orders.order_number,
                        orders.customer_name,
                        orders.phone,
                        orders.address,
                        orders.city,
                        orders.payment_method,
                        orders.total_amount,
                        orders.created_at,
                        users.email
                     FROM orders
                     INNER JOIN users
                     ON orders.user_id = users.id
                     ORDER BY orders.created_at DESC`
                );


            // Get items for every order
            for (const order of orders) {

                const [items] =
                    await db.execute(
                        `SELECT
                            product_id,
                            product_name,
                            price,
                            quantity
                         FROM order_items
                         WHERE order_id = ?`,
                        [order.id]
                    );


                order.items = items;

            }


            res.json(orders);

        }

        catch (error) {

            console.error(
                "ADMIN ORDERS ERROR:",
                error
            );

            res.status(500).json({
                message:
                    "Could not load orders."
            });

        }

    }
);


// ======================================================
// EXPORT ROUTER
// ======================================================

module.exports = router;