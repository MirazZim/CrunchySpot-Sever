const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 3000;

const FormData = require("form-data"); // form-data v4.0.1
const Mailgun = require("mailgun.js"); // mailgun.js v11.1.0
const mailgun = new Mailgun(FormData);

const mg = mailgun.client({
  username: "api",
  key: process.env.MAIL_GUN_API_KEY || "API_KEY",
  // When you have an EU-domain, you must specify the endpoint:
  // url: "https://api.eu.mailgun.net/v3"
});

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
    const paymentCollection = client.db("CrunchySpot").collection("payments");


    //Jwt related apis
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '4h' });
      res.send({ token });
    })

    //middleware
    const verifyToken = (req, res, next) => {
      // Logs all incoming information (for debugging)
      console.log("🔹 Incoming Request Headers:", req.headers);
  
      // Check if the Authorization header (ID card) exists
      if (!req.headers.authorization) {
          console.error("❌ Token missing in request headers");
          return res.status(401).send({ message: "Forbidden access! No Token" });
          // "Hey! You can't enter without your ID card!"
      }
  
      // Extract the token (ID card) from "Bearer token"
      const token = req.headers.authorization.split(" ")[1];
  
      if (!token) {
          console.error("❌ Token format incorrect (Missing Bearer Token)");
          return res.status(401).send({ message: "Forbidden access! Invalid Token Format" });
          // "Your ID card is not in the right format!"
      }
  
      // Now, verify if the token is real (not fake)
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
          if (err) {
              console.error("❌ JWT Verification Error:", err.message);
              return res.status(403).send({ message: "Forbidden access! Invalid Token" });
              // "This ID card is fake or expired!"
          }
  
          // Token is valid! Save user's information to use later
          req.decoded = decoded;
          console.log("✅ Token successfully verified for:", decoded.email);
          
          // "All good! You can go ahead."
          next();
      });
  };
  
  
  
  
  // Middleware to verify if user is admin
  const verifyAdmin = async (req, res, next) => {
    try {
        // Check if the user's email was saved from the token
        if (!req.decoded || !req.decoded.email) {
            console.error("Decoded token does not contain an email");
            return res.status(403).send({ message: "Forbidden access! Invalid User" });
            // "Who are you? Your ID card doesn't have your name!"
        }

        const email = req.decoded.email;
        console.log("Verifying admin for:", email);

        // Check in the database if this user exists
        const user = await userCollection.findOne({ email });

        if (!user) {
            console.error("User not found in database:", email);
            return res.status(403).send({ admin: false, message: "Forbidden access! User Not Found" });
            // "You don't go to this school!"
        }

        // Check if user has admin role
        if (user.role !== "admin") {
            console.error("User is not an admin:", email);
            return res.status(403).send({ admin: false, message: "Forbidden access! Not Admin" });
            // "You can't enter here—admins only!"
        }

        console.log("Admin verified:", email);
        next();  // "All good, you're an admin! You can enter."
    } catch (error) {
        console.error("Error in verifyAdmin:", error);
        res.status(500).send({ message: "Internal Server Error" });
        // "Oops! Something went wrong inside."
    }
};



    //users related apis

    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {

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
        return res.send({ message: 'User already exists', insertedId: null });
      } else {
        const result = await userCollection.insertOne(user);
        res.send(result);
      }
    })


    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = { $set: { role: 'admin' } };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
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

  //Payment intent
  app.post('/create-payment-intent', async (req, res) => {
    const {price} = req.body;
    const amount  = parseInt(price * 100);


    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: "usd",
      payment_method_types: ["card"]
    });
    res.send({ 
      clientSecret: paymentIntent.client_secret });
  })

  //payment related api's
  app.post('/payments', async (req, res) => {
    const payment = req.body;
    const paymentResult =  await paymentCollection.insertOne(payment);
   

    //delete each item from the cart
    console.log('payment Info', payment);
    const query = {_id: {
      $in: payment.cartIds.map(id => new ObjectId(id))
    }}
    const deleteResult = await cartCollection.deleteMany(query);

    //Send user a email about payment confirmation
    mg.messages.create(process.env.MAIL_GUN_DOMAIN, {
      from: "Mailgun Sandbox <postmaster@sandbox6560f38b4058420e8709c3c30786d072.mailgun.org>",
      to: ["Miraz <miraz.zim.38@gmail.com>"],
      subject: "CrunchySpot Payment Confirmation",
      html: `<div>
        <h2>Thank You for Your Order</h2>
        <h4>Your tansaction id is <strong>${payment.transactionId}</strong></h4>
        <p>Payment Amount: ${payment.amount}</p>
        <p>We would like to get your feed back about the food</p>
        <p>Thank You</p>
      </div>`
    })
    .then(msg => console.log(msg))
    .catch(err => console.error(err));

   



    res.send({paymentResult, deleteResult});
  })


  app.get('/payments/:email',verifyToken, async (req, res) => {
    const email = req.params.email;
    const query = { email: email };
    if(email !== req.decoded.email) {
      return res.status(403).send({ message: 'Forbidden access!' });
    }
    const result = await paymentCollection.find(query).toArray();
    res.send(result);
  })




    //Menu Api  (CRUD)        

    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    })

    app.post("/menu", verifyToken, verifyAdmin, async (req, res) => {
      const newItem = req.body;
      const result = await menuCollection.insertOne(newItem);
      res.send(result);
    })

    // Delete a menu item by its ID
    // Try to use as ObjectId first, if that fails, try as string
    app.delete("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      let query;

      // Try to use as ObjectId first
      try {
        // Try to use ObjectId
        query = { _id: new ObjectId(id) };
        // Delete the document
        const result = await menuCollection.deleteOne(query);

        // If no document was deleted, try as string ID
        if (result.deletedCount === 0) {
          // Try to use string ID
          query = { _id: id };
          // Delete the document
          const stringResult = await menuCollection.deleteOne(query);
          // Send the result
          res.send(stringResult);
        } else {
          // Send the result
          res.send(result);
        }
      } catch (error) {
        // If ObjectId conversion fails, try as string
        // Try to use string ID
        query = { _id: id };
        // Delete the document
        const stringResult = await menuCollection.deleteOne(query);
        // Send the result
        res.send(stringResult);
      }
    })



    // Get a menu item by its ID
    // Try to use as ObjectId first, if that fails, try as string
    app.get("/menu/:id", async (req, res) => {
      try {
        const id = req.params.id;

        // First try as ObjectId
        let query = {};
        if (ObjectId.isValid(id)) {
          // Try to use ObjectId
          query = { _id: new ObjectId(id) };
        }

        let result = await menuCollection.findOne(query);

        // If not found, try as string
        if (!result) {
          // Try to use string ID
          query = { _id: id };
          // Find the document
          result = await menuCollection.findOne(query);
        }

        if (!result) {
          // If not found, send 404 error
          return res.status(404).send({ error: "Menu item not found" });
        }

        // Send the result
        res.send(result);
      } catch (error) {
        // If something goes wrong, send 500 error
        console.error("Error fetching menu item:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });


  // Update a menu item by its ID
  // Try to use as ObjectId first, if that fails, try as string
  app.patch('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
      const item = req.body;
      const id = req.params.id;
      
      // First try as ObjectId
      let filter = {};
      if (ObjectId.isValid(id)) {
        // Try to use ObjectId
        filter = { _id: new ObjectId(id) };
      }
      
      const updatedDoc = {
        $set: {
          name: item.name,
          price: item.price,
          recipe: item.recipe,
          description: item.description,
          image: item.image
        }
      };
      
      let result = await menuCollection.updateOne(filter, updatedDoc);
      
      // If no document was updated, try as string ID
      if (result.matchedCount === 0) {
        // Try to use string ID
        filter = { _id: id };
        // Update the document
        result = await menuCollection.updateOne(filter, updatedDoc);
      }
      
      if (result.matchedCount === 0) {
        // If not found, send 404 error
        return res.status(404).send({ error: "Menu item not found" });
      }
      
      // Send the result
      res.send(result);
    } catch (error) {
      // If something goes wrong, send 500 error
      console.error("Error updating menu item:", error);
      res.status(500).send({ error: "Internal Server Error" });
    }
  })

  //stats or analytics
  app.get('/admin-stats',verifyToken, verifyAdmin,  async (req, res) => {
    const users = await userCollection.estimatedDocumentCount();
    const menuItems = await menuCollection.estimatedDocumentCount();
    const orders = await paymentCollection.estimatedDocumentCount();
    
    //This is not the best way
    // const payments = await paymentCollection.find().toArray();  
    // const totalRevenue = payments.reduce((total, payment) => total + payment.amount, 0);
    
    
    //Total revenue this the best way
    const totalRevenue = await paymentCollection.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" }
        }
      }
    ]).toArray().then(result => result[0].totalRevenue);

    res.send({ users, menuItems, orders, totalRevenue });
  }
)

//Order Status or analytics

app.get('/order-stats', verifyToken, verifyAdmin, async (req, res) => {
  // Unwind the array of menu item IDs
  // This will create a new document for each menu item
  const result  = await paymentCollection.aggregate([
      {
       $unwind: '$menuItemIds'
      },

      // lookup the menu items based on the IDs
      // and store them in a new array called 'menuItems'
      {
        $lookup: {
          from: 'menu',
          localField: 'menuItemIds',
          foreignField: '_id',
          as: 'menuItems'
        }
      },

      // Unwind the new array of menu items
      // This will create a new document for each menu item
      {
         $unwind: '$menuItems'
      },

      // Group the results by the category of the menu item
      // and calculate the total quantity and revenue for each category
      {
        $group: {
          _id: '$menuItems.category',
          quantity: { $sum: 1 },
          totalRevenue: { $sum: '$menuItems.price' }
        }
      },

      // Project the results to only include the category, quantity and revenue
      {
        $project: {
          _id: 0 ,
          category: '$_id',
          quantity: '$quantity',
          totalRevenue: '$totalRevenue'
        }
      }
  ]).toArray();
  res.send(result);
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