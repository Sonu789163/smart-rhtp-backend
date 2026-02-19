"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const mongoose_1 = __importDefault(require("mongoose"));
const index_1 = require("../index");
// Mock mongoose
jest.mock('mongoose', () => {
    const actualMongoose = jest.requireActual('mongoose');
    return {
        ...actualMongoose,
        connect: jest.fn().mockResolvedValue(actualMongoose),
        connection: {
            on: jest.fn(),
            once: jest.fn(),
        },
    };
});
// Mock Document model
jest.mock('../models/Document', () => ({
    Document: {
        find: jest.fn(),
    },
}));
describe('Document Routes', () => {
    afterAll(async () => {
        await mongoose_1.default.disconnect();
    });
    it('GET /health - should return 200', async () => {
        const response = await (0, supertest_1.default)(index_1.app).get('/health');
        expect(response.status).toBe(200);
    });
    it('GET /api/documents - should handle unauthorized', async () => {
        const response = await (0, supertest_1.default)(index_1.app).get('/api/documents');
        // If no token is provided, it should be 401
        expect(response.status).toBe(401);
    });
});
