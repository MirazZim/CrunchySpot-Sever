const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const port = process.env.PORT || 3000;

//Middlewares
app.use(cors());
app.use(express.json());


//MongoDB

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qlurp.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const menuCollection = client.db("CrunchySpot").collection("menu");
    const cartCollection = client.db("CrunchySpot").collection("carts");
    const userCollection = client.db("CrunchySpot").collection("users");
   

    //Jwt related apis
    app.post('/jwt', async(req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '3h' });
      res.send({ token });
    })

    //middleware
    const verifyToken = (req, res, next) => {
      // console.log('inside verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'Forbidden access!' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(403).send({ message: 'Forbidden access!' });
        }
        req.decoded = decoded;
        next();
      })
    }

    //use verify admin after verify token
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ admin: false , message: 'Forbidden access!'});
      }
      next();
    }


    //users related apis

  app.get('/users',verifyToken, verifyAdmin, async (req, res) => {
    
    const result = await userCollection.find().toArray();
    res.send(result);
  })  
  
  app.get('/users/admin/:email', verifyToken, async (req, res) => {
    const email = req.params.email;
    if (email !== req.decoded.email) {
      return res.status(403).send({ admin: false });
    }
  
    const user = await userCollection.findOne({ email });
    const isAdmin = user?.role === 'admin';
    res.send({ admin: isAdmin });
  });



    app.post('/users', async (req, res) => {
      const user = req.body;
      //inser email if user doesnt exist 
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message:'User already exists', insertedId: null });
      } else {
        const result = await userCollection.insertOne(user);
        res.send(result);
      }
    }) 


    app.patch('/users/admin/:id',verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = { $set: { role: 'admin' } };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    app.delete('/users/:id',verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })





    //Carts Api

    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    })

    app.post("/carts", async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    })

    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    })


    //Menu Api  (CRUD)        

    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    })

    app.post("/menu",verifyToken,verifyAdmin, async (req, res) => {
      const newItem = req.body;
      const result = await menuCollection.insertOne(newItem);
      res.send(result);
    })

    app.delete("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      let query;
      
      // Try to use as ObjectId first
      try {
        query = { _id: new ObjectId(id) };
        const result = await menuCollection.deleteOne(query);
        
        // If no document was deleted, try as string ID
        if (result.deletedCount === 0) {
          query = { _id: id };
          const stringResult = await menuCollection.deleteOne(query);
          res.send(stringResult);
        } else {
          res.send(result);
        }
      } catch (error) {
        // If ObjectId conversion fails, try as string
        query = { _id: id };
        const stringResult = await menuCollection.deleteOne(query);
        res.send(stringResult);
      }
    })



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);



app.get("/", (req, res) => {
  res.send("Welcome to CrunchySpot Server!");
})
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});