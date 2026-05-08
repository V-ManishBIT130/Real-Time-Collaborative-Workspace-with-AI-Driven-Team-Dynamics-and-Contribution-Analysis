
# Real-Time Collaborative Workspace with AI-Driven Team Dynamics and Contribution Analysis (CollabLens)

CollabLens is an intelligent, real-time collaboration platform designed to enhance team productivity and provide deep insights into team dynamics. It combines a seamless multi-user workspace (chat, whiteboard, code editor) with an AI-powered analytics engine that evaluates participation quality, detects when teams are stuck, and maps communication networks.

## 🌟 Key Features

- **Real-Time Collaboration**: Instant messaging, synchronized whiteboarding (Excalidraw), and live code editing (Monaco) powered by Socket.IO.
- **AI-Driven Analytics**: Uses NLP and clustering (Sentence Transformers, DBSCAN) to analyze chat topics and idea progression.
- **Team Dynamics Mapping**: Generates communication network graphs to visualize engagement and identify isolated members.
- **Stuck Detection**: Automatically recognizes when a team is losing momentum based on sentiment drops, topic stagnation, and message gaps.
- **Contribution Quality Scoring**: Evaluates individual participation based on idea generation, agreement, and coordination.

## 🏗️ Architecture

CollabLens is built with a microservices-inspired architecture:

- **Frontend**: React 18, TypeScript, Vite, Zustand, Socket.IO Client.
- **Backend**: Node.js, Express, Socket.IO, MongoDB (Mongoose).
- **ML Service**: Python, Flask, HuggingFace Transformers, scikit-learn, NetworkX.

## 🚀 Quick Start

### Prerequisites
- Node.js (v18+)
- Python (3.9+)
- MongoDB Atlas (or local instance)

### 1. Backend Setup (Node.js)
```bash
cd backend
npm install
npm run dev
```

### 2. Frontend Setup (React/Vite)
```bash
cd frontend
npm install
npm run dev
```

### 3. ML Service Setup (Python)
```bash
cd ml-service
python -m venv venv
# Activate venv:
# Windows: venv\Scripts\activate
# Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
python app.py
```

## 🔐 Environment Variables Configuration

Make sure to create a `.env` file in each respective directory based on these templates. **Do not commit your actual `.env` files to version control.**

**`backend/.env`**
```env
MONGO_URI=mongodb://localhost:27017/collab-lens
PORT=3001
ML_SERVICE_URL=http://localhost:5000
JWT_SECRET=your_jwt_secret_here
FRONTEND_URL=http://localhost:5173
```

**`frontend/.env`**
*(Optional. The app auto-detects network IP for multi-device testing)*
```env
# VITE_BACKEND_URL=http://localhost:3001
```

**`ml-service/.env`**
```env
PORT=5000
```

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the issues page.

## 📝 License
This project is licensed under the MIT License.
