// Used for the MySQL database connection.
// Rename to 'secure.config.cjs' and enter your database credentials.

module.exports = {
    rds: {
        host: "...",
        port: 3306, // optional, defaults to MySQL's standard port if omitted
        database: "...",
        user: "...",
        password: "..."
    }
};
