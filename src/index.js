import express from 'express'
import { PORT } from './config.js';
//import cors from 'cors';
//import { router } from './routes/index.js';

const app = express();  

app.listen(PORT, () => {
    console.log("Servidor corriendo en el puerto", PORT);
});