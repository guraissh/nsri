FROM python:3.13-slim

WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py .
COPY static/ ./static/

# Create directories for data persistence
RUN mkdir -p /app/downloads /app/data

# Expose port
EXPOSE 8000

# Run the application
CMD ["python", "main.py"]
