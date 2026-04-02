import jwt from "jsonwebtoken";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET missing");
}

export const protect = (req, res, next) => {

  const authHeader = req.header("Authorization");

  if (!authHeader) {
    return res.status(401).json({
      message: "Not authorized"
    });
  } 

  const parts = authHeader.split(" ");

  // Expect: Bearer TOKEN
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({
      message: "Invalid authorization format"
    });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    // Standardized user object
    req.user = {
      id: decoded.id
    };

    next();

  } catch (error) {

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Token expired"
      });
    }

    return res.status(401).json({
      message: "Invalid token"
    });
  }
};