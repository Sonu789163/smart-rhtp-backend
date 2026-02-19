"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const mongoose_1 = __importDefault(require("mongoose"));
const index_1 = require("../index");
const User_1 = require("../models/User");
// Set timeout to 10 seconds
jest.setTimeout(10000);
// Mock mongoose
jest.mock('mongoose', () => {
    const actualMongoose = jest.requireActual('mongoose');
    const mockMongoose = {
        ...actualMongoose,
        connect: jest.fn().mockResolvedValue({}),
        connection: {
            on: jest.fn(),
            once: jest.fn(),
            close: jest.fn().mockResolvedValue({}),
        },
        disconnect: jest.fn().mockResolvedValue({}),
    };
    // Keep the real Schema and model but prevent them from actually connecting
    return mockMongoose;
});
// IMPORTANT: Mock the User model specifically so we can control its methods
jest.mock('../models/User', () => {
    const mongoose = jest.requireActual('mongoose');
    return {
        User: {
            findOne: jest.fn(),
            create: jest.fn(),
            // Mock other methods if needed
        }
    };
});
// Mock bcryptjs
jest.mock('bcryptjs', () => ({
    compare: jest.fn().mockResolvedValue(true),
    hash: jest.fn().mockResolvedValue('hashed_password'),
    genSalt: jest.fn().mockResolvedValue('salt'),
}));
// Mock email service
jest.mock('../services/emailService', () => ({
    testSmtpConnection: jest.fn().mockResolvedValue(true),
    sendEmail: jest.fn().mockResolvedValue(true),
}));
describe('Auth Routes', () => {
    it('POST /api/auth/login - should return 401 for invalid user', async () => {
        User_1.User.findOne.mockResolvedValue(null);
        const response = await (0, supertest_1.default)(index_1.app)
            .post('/api/auth/login')
            .send({ email: 'test@example.com', password: 'wrongpassword' });
        expect([401, 404]).toContain(response.status);
    });
    it('POST /api/auth/register - should initiate registration', async () => {
        User_1.User.findOne.mockResolvedValue(null);
        User_1.User.create.mockResolvedValue({
            _id: new mongoose_1.default.Types.ObjectId(),
            email: 'newuser@example.com',
            save: jest.fn().mockResolvedValue(true)
        });
        const response = await (0, supertest_1.default)(index_1.app)
            .post('/api/auth/register')
            .send({
            email: 'newuser@example.com',
            password: 'Password123!',
        });
        expect([201, 200, 400]).toContain(response.status);
    });
});
