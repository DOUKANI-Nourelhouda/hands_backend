const dns = require("dns");

dns.setServers([
  "8.8.8.8",
  "1.1.1.1"
]);

const dotenv = require("dotenv");
const mongoose = require("mongoose");

const Residence = require("../models/Residence");
const residences = require("../data/residences.json");

dotenv.config({ override: true });

const seedResidences = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected");

    await Residence.deleteMany({});

    await Residence.insertMany(residences);

    console.log(`${residences.length} residences inserted successfully`);

    await mongoose.connection.close();

    console.log("MongoDB connection closed");
  } catch (error) {
    console.error("Seeding error:", error.message);
    process.exit(1);
  }
};

seedResidences();