import { Express, Request, Response } from "express";
import { storage } from "../storage";
import { insertUserProfileSchema, contactInfoSchema, jobPreferencesSchema, onlinePresenceSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import path from "path";

// Configure multer for in-memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept PDF, images, and documents
    const allowedTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/gif',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, images, and documents are allowed.'));
    }
  },
});

// Type declaration for Express session with User
declare global {
  namespace Express {
    interface User {
      id: number;
      name: string;
      email: string;
      [key: string]: any;
    }
  }
}

// Middleware to check if user is authenticated
function isAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated() && req.user) {
    return next();
  }
  return res.status(401).json({ message: "Not authenticated" });
}

export function registerProfileRoutes(app: Express) {
  // Get user profile
  app.get('/api/profile', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.id;
      const profile = await storage.getUserProfile(userId);
      
      if (!profile) {
        // Return empty profile with defaults if not found
        return res.status(200).json({
          userId,
          fullName: req.user.name || '',
          email: req.user.email || '',
          profileCompleteness: 0
        });
      }
      
      return res.status(200).json(profile);
    } catch (error) {
      console.error('Error fetching profile:', error);
      return res.status(500).json({ message: 'Failed to fetch profile' });
    }
  });
  
  // Create or update user profile
  app.post('/api/profile', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.id;
      const profileData = { ...req.body, userId };
      
      // Validate the profile data
      try {
        insertUserProfileSchema.parse(profileData);
      } catch (validationError) {
        if (validationError instanceof z.ZodError) {
          return res.status(400).json({ 
            message: 'Invalid profile data', 
            errors: validationError.errors 
          });
        }
      }
      
      // Check if profile exists
      const existingProfile = await storage.getUserProfile(userId);
      let profile;
      
      if (existingProfile) {
        profile = await storage.updateUserProfile(userId, profileData);
      } else {
        profile = await storage.createUserProfile(profileData);
      }
      
      return res.status(200).json(profile);
    } catch (error) {
      console.error('Error updating profile:', error);
      return res.status(500).json({ message: 'Failed to update profile' });
    }
  });
  
  // Update contact information
  app.patch('/api/profile/contact', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.id;
      const contactData = req.body;
      
      // Validate the contact data
      try {
        contactInfoSchema.parse(contactData);
      } catch (validationError) {
        if (validationError instanceof z.ZodError) {
          return res.status(400).json({ 
            message: 'Invalid contact information', 
            errors: validationError.errors 
          });
        }
      }
      
      // Get existing profile or create new one
      const existingProfile = await storage.getUserProfile(userId);
      let profile;
      
      if (existingProfile) {
        profile = await storage.updateUserProfile(userId, contactData);
      } else {
        profile = await storage.createUserProfile({ ...contactData, userId });
      }
      
      return res.status(200).json(profile);
    } catch (error) {
      console.error('Error updating contact info:', error);
      return res.status(500).json({ message: 'Failed to update contact information' });
    }
  });
  
  // Update job preferences
  app.patch('/api/profile/job-preferences', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.id;
      const preferencesData = req.body;
      
      // Validate the preferences data
      try {
        jobPreferencesSchema.parse(preferencesData);
      } catch (validationError) {
        if (validationError instanceof z.ZodError) {
          return res.status(400).json({ 
            message: 'Invalid job preferences', 
            errors: validationError.errors 
          });
        }
      }
      
      // Get existing profile or create new one
      const existingProfile = await storage.getUserProfile(userId);
      let profile;
      
      if (existingProfile) {
        profile = await storage.updateUserProfile(userId, preferencesData);
      } else {
        profile = await storage.createUserProfile({ ...preferencesData, userId });
      }
      
      return res.status(200).json(profile);
    } catch (error) {
      console.error('Error updating job preferences:', error);
      return res.status(500).json({ message: 'Failed to update job preferences' });
    }
  });
  
  // Update online presence
  app.patch('/api/profile/online-presence', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.id;
      const onlineData = req.body;
      
      // Validate the online presence data
      try {
        onlinePresenceSchema.parse(onlineData);
      } catch (validationError) {
        if (validationError instanceof z.ZodError) {
          return res.status(400).json({ 
            message: 'Invalid online presence data', 
            errors: validationError.errors 
          });
        }
      }
      
      // Get existing profile or create new one
      const existingProfile = await storage.getUserProfile(userId);
      let profile;
      
      if (existingProfile) {
        profile = await storage.updateUserProfile(userId, onlineData);
      } else {
        profile = await storage.createUserProfile({ ...onlineData, userId });
      }
      
      return res.status(200).json(profile);
    } catch (error) {
      console.error('Error updating online presence:', error);
      return res.status(500).json({ message: 'Failed to update online presence' });
    }
  });
  
  // Portfolio file upload
  app.post('/api/profile/portfolio', isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      const userId = req.user.id;
      const file = req.file;
      
      // Convert file to base64
      const fileData = file.buffer.toString('base64');
      
      const portfolio = await storage.createPortfolio({
        userId,
        filename: file.originalname,
        fileData,
        fileType: file.mimetype,
      });
      
      // Don't return the full file data in the response
      const { fileData: _, ...portfolioData } = portfolio;
      
      return res.status(201).json(portfolioData);
    } catch (error) {
      console.error('Error uploading portfolio:', error);
      return res.status(500).json({ message: 'Failed to upload portfolio file' });
    }
  });
  
  // Get all portfolios for a user
  app.get('/api/profile/portfolios', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.id;
      const portfolios = await storage.getUserPortfolios(userId);
      
      // Don't return the full file data in the response
      const portfolioData = portfolios.map(({ fileData, ...data }) => data);
      
      return res.status(200).json(portfolioData);
    } catch (error) {
      console.error('Error fetching portfolios:', error);
      return res.status(500).json({ message: 'Failed to fetch portfolios' });
    }
  });
  
  // Get a specific portfolio file
  app.get('/api/profile/portfolio/:id', isAuthenticated, async (req, res) => {
    try {
      const portfolioId = parseInt(req.params.id);
      const userId = req.user.id;
      
      const portfolio = await storage.getPortfolio(portfolioId);
      
      if (!portfolio) {
        return res.status(404).json({ message: 'Portfolio not found' });
      }
      
      // Ensure user owns this portfolio
      if (portfolio.userId !== userId) {
        return res.status(403).json({ message: 'Unauthorized' });
      }
      
      // Set appropriate content type
      res.setHeader('Content-Type', portfolio.fileType);
      res.setHeader('Content-Disposition', `inline; filename="${portfolio.filename}"`);
      
      // Convert base64 back to binary and send
      const fileBuffer = Buffer.from(portfolio.fileData, 'base64');
      return res.status(200).send(fileBuffer);
    } catch (error) {
      console.error('Error fetching portfolio:', error);
      return res.status(500).json({ message: 'Failed to fetch portfolio file' });
    }
  });
  
  // Delete a portfolio file
  app.delete('/api/profile/portfolio/:id', isAuthenticated, async (req, res) => {
    try {
      const portfolioId = parseInt(req.params.id);
      const userId = req.user.id;
      
      const portfolio = await storage.getPortfolio(portfolioId);
      
      if (!portfolio) {
        return res.status(404).json({ message: 'Portfolio not found' });
      }
      
      // Ensure user owns this portfolio
      if (portfolio.userId !== userId) {
        return res.status(403).json({ message: 'Unauthorized' });
      }
      
      await storage.deletePortfolio(portfolioId);
      
      return res.status(200).json({ message: 'Portfolio deleted successfully' });
    } catch (error) {
      console.error('Error deleting portfolio:', error);
      return res.status(500).json({ message: 'Failed to delete portfolio file' });
    }
  });
  
  // Calculate profile completeness
  app.get('/api/profile/completeness', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.id;
      const completeness = await storage.calculateProfileCompleteness(userId);
      
      return res.status(200).json({ completeness });
    } catch (error) {
      console.error('Error calculating profile completeness:', error);
      return res.status(500).json({ message: 'Failed to calculate profile completeness' });
    }
  });

  // Update match score threshold
  app.patch('/api/profile/match-threshold', isAuthenticated, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Not authenticated' });
      }
      
      const userId = req.user.id;
      const { matchScoreThreshold } = req.body;
      
      // Validate the threshold value
      if (typeof matchScoreThreshold !== 'number' || matchScoreThreshold < 0 || matchScoreThreshold > 100) {
        return res.status(400).json({ 
          message: 'Invalid match score threshold', 
          error: 'Match score threshold must be a number between 0 and 100' 
        });
      }
      
      // Get existing profile or create new one
      const existingProfile = await storage.getUserProfile(userId);
      let profile;
      
      if (existingProfile) {
        profile = await storage.updateUserProfile(userId, { matchScoreThreshold });
      } else {
        profile = await storage.createUserProfile({ userId, matchScoreThreshold });
      }
      
      if (!profile) {
        return res.status(500).json({ message: 'Failed to update match score threshold' });
      }
      
      return res.status(200).json({ 
        matchScoreThreshold: profile.matchScoreThreshold,
        message: 'Match score threshold updated successfully'
      });
    } catch (error) {
      console.error('Error updating match score threshold:', error);
      return res.status(500).json({ message: 'Failed to update match score threshold' });
    }
  });
}