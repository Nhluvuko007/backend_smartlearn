const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'smartlearn_ultra_secure_fallback_key';

module.exports = function (req, res, next) {
  // 1. Grab the token from the incoming request headers
  const authHeader = req.header('Authorization');

  // Check if the Authorization header exists and follows the 'Bearer <token>' format
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Access denied. No authentication token provided.' });
  }

  try {
    // 2. Extract the actual token string (strip out the 'Bearer ' prefix)
    const token = authHeader.split(' ')[1];

    // 3. Decrypt and verify the token signature
    const decoded = jwt.verify(token, JWT_SECRET);

    // 4. Attach the verified user details directly to the request object
    req.user = decoded; 
    
    // Move on smoothly to the actual route handler code
    next();
  } catch (error) {
    res.status(401).json({ message: 'Session expired or invalid token verification.' });
  }
};