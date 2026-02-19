"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// __tests__/app.test.ts
const supertest_1 = __importDefault(require("supertest"));
const mongoose_1 = __importDefault(require("mongoose"));
const index_1 = require("../index");
// Mock mongoose to prevent actual DB connection during tests
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
describe('Express app sanity checks', () => {
    afterAll(async () => {
        // Ensure any open handles are closed if possible, though we mocked connect
        await mongoose_1.default.disconnect();
    });
    it('should be an Express instance', () => {
        expect(index_1.app).toBeDefined();
        expect(typeof index_1.app.use).toBe('function');
    });
    it('should return 404 for unknown route', async () => {
        // We use a small timeout to avoid hangs if something is still pending
        const response = await (0, supertest_1.default)(index_1.app).get('/nonexistent');
        expect(response.status).toBe(404);
    });
});
