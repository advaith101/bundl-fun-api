const express = require('express');
const tokenRoutes = require('./routes/tokenRoutes');
const sequelize = require('./config/database');

const app = express();

app.use(express.json());
app.use('/api/tokens', tokenRoutes);

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await sequelize.sync();
    console.log('Database connected');
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Unable to start the server:', error);
  }
}

startServer();