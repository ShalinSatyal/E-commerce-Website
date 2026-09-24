const bcrypt = require("bcryptjs");

const db = require("./db");

async function createAdmin() {
  try {
    const name = "SRS Store Admin";

    const email = "admin@srsfashionstore.com";

    const password = "Admin@12345";

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.execute(
      `INSERT INTO users
            (name, email, password, role)
            VALUES (?, ?, ?, 'admin')`,
      [name, email, hashedPassword],
    );

    console.log("Admin account created successfully.");

    console.log("Email:", email);

    console.log("Password:", password);

    process.exit(0);
  } catch (error) {
    console.error("Could not create admin:", error);

    process.exit(1);
  }
}

createAdmin();
