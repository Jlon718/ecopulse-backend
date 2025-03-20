// complete-user-seeder.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected for seeding'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

const User = require('./models/User');

// Configuration constants
const SEED_CONFIG = {
  totalUsers: 55,
  adminCount: 5,
  password: 'Admin@123',
  visitPatterns: {
    daily: { weight: 0.2, maxVisits: 90 },
    weekly: { weight: 0.3, maxVisits: 24 },
    monthlySpike: { weight: 0.3, maxVisits: 18 },
    biWeekly: { weight: 0.1, maxVisits: 12 },
    random: { weight: 0.1, maxVisits: 30 }
  }
};

// Helper functions
const randomDate = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
const getRandomItem = (array) => array[Math.floor(Math.random() * array.length)];
const addRandomTime = (date) => {
  date.setHours(Math.floor(Math.random() * 24));
  date.setMinutes(Math.floor(Math.random() * 60));
  date.setSeconds(Math.floor(Math.random() * 60));
};

// Visit pattern generator
const generateVisits = (user, now) => {
  const visits = [];
  const pattern = weightedRandom(SEED_CONFIG.visitPatterns);
  const createdAt = user.createdAt;
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);
  const startDate = new Date(Math.max(createdAt.getTime(), thirtyDaysAgo.getTime()));
  const endDate = now;

  let visitCount;
  switch(pattern) {
    case 'daily':
      visitCount = Math.min(Math.floor((endDate - startDate) / 86400000), SEED_CONFIG.visitPatterns.daily.maxVisits);
      for(let i = 0; i < visitCount; i++) {
        const visitDate = new Date(startDate.getTime() + (i * 86400000));
        visits.push({ userId: user._id, visitDate });
      }
      break;

    case 'weekly':
      visitCount = Math.min(Math.floor((endDate - startDate) / 604800000), SEED_CONFIG.visitPatterns.weekly.maxVisits);
      for(let i = 0; i < visitCount; i++) {
        const visitDate = new Date(startDate.getTime() + (i * 604800000));
        addRandomTime(visitDate);
        visits.push({ userId: user._id, visitDate });
      }
      break;

    case 'monthlySpike':
      const monthsDiff = endDate.getMonth() - startDate.getMonth() + 
        (12 * (endDate.getFullYear() - startDate.getFullYear()));
      visitCount = Math.min(monthsDiff, SEED_CONFIG.visitPatterns.monthlySpike.maxVisits);
      for(let i = 0; i < visitCount; i++) {
        const monthStart = new Date(startDate);
        monthStart.setMonth(startDate.getMonth() + i);
        const spikeDate = randomDate(monthStart, new Date(monthStart).setDate(28));
        [0, 2, 4].forEach(hours => {
          const visit = new Date(spikeDate);
          visit.setHours(visit.getHours() + hours);
          visits.push({ userId: user._id, visitDate: visit });
        });
      }
      break;

    case 'biWeekly':
      visitCount = Math.min(Math.floor((endDate - startDate) / 1209600000), SEED_CONFIG.visitPatterns.biWeekly.maxVisits);
      for(let i = 0; i < visitCount; i++) {
        const visitDate = new Date(startDate.getTime() + (i * 1209600000));
        addRandomTime(visitDate);
        visits.push({ userId: user._id, visitDate });
      }
      break;

    default: // random
      visitCount = Math.floor(Math.random() * SEED_CONFIG.visitPatterns.random.maxVisits) + 1;
      for(let i = 0; i < visitCount; i++) {
        visits.push({ 
          userId: user._id, 
          visitDate: randomDate(startDate, endDate)
        });
      }
  }
  return visits;
};

const weightedRandom = (patterns) => {
  const totalWeight = Object.values(patterns).reduce((sum, p) => sum + p.weight, 0);
  let random = Math.random() * totalWeight;
  for(const [pattern, config] of Object.entries(patterns)) {
    if(random < config.weight) return pattern;
    random -= config.weight;
  }
  return Object.keys(patterns)[0];
};

// Main seeder function
const seedUsers = async () => {
  try {
    // Cleanup previous seeded data
    const existingSeeded = await User.find({ email: { $regex: /@gmail\.com$/ } });
    const seededIds = existingSeeded.map(u => u._id);
    
    await mongoose.model('Visit').deleteMany({ userId: { $in: seededIds } });
    await User.deleteMany({ _id: { $in: seededIds } });
    console.log(`Cleared ${existingSeeded.length} previous seeded users`);

    // Seed new data
    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(now.getMonth() - 6);
    
    const visitStats = {
      total: 0,
      monthly: new Map(),
      patterns: new Map()
    };

    for(let i = 0; i < SEED_CONFIG.totalUsers; i++) {
      const isAdmin = i < SEED_CONFIG.adminCount;
      const firstName = getRandomItem(['John', 'Jane', /*...*/]);
      const lastName = getRandomItem(['Smith', 'Johnson', /*...*/]);
      
      const user = new User({
        firstName,
        lastName,
        email: `${firstName.toLowerCase()}${lastName.toLowerCase()}${Math.floor(Math.random() * 1000)}@gmail.com`,
        password: await bcrypt.hash(SEED_CONFIG.password, await bcrypt.genSalt(10)),
        // ... other user properties ...
        createdAt: randomDate(sixMonthsAgo, now)
      });

      await user.save();
      
      // Generate visits
      if(!user.isDeactivated && !user.isAutoDeactivated) {
        const visits = generateVisits(user, now);
        visitStats.total += visits.length;
        
        visits.forEach(v => {
          const month = v.visitDate.getMonth() + 1;
          visitStats.monthly.set(month, (visitStats.monthly.get(month) || 0) + 1);
        });
        
        await mongoose.model('Visit').insertMany(visits);
      }
    }

    // Display statistics
    console.log('\n📊 Visit Statistics:');
    console.log(`Total Visits: ${visitStats.total}`);
    console.log('Monthly Distribution:');
    Array.from(visitStats.monthly.entries()).forEach(([month, count]) => {
      console.log(`- Month ${month}: ${count} visits`);
    });

    mongoose.disconnect();
  } catch(error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
};

seedUsers();