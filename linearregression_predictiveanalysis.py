# Import necessary libraries
import os
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error
import joblib
import logging
from pymongo import MongoClient
from dotenv import load_dotenv
from pymongo.errors import ConnectionFailure
import time

# Load environment variables from .env file
load_dotenv()

# Configure the logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# MongoDB connection
MONGO_URI = os.getenv("MONGO_URL")  # Load MongoDB URI from environment variables
DATABASE_NAME = "ecopulse"  # Replace with your database name
COLLECTION_NAME = "predictiveAnalysis"  # Replace with your collection name

def connect_to_mongodb(retries=3, delay=5):
    """
    Connect to MongoDB Atlas and return the collection.
    Retries the connection in case of failure.
    """
    for attempt in range(retries):
        try:
            client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
            db = client[DATABASE_NAME]
            collection = db[COLLECTION_NAME]
            # Attempt to ping the server to check the connection
            client.admin.command('ping')
            logger.debug("Connected to MongoDB Atlas successfully.")
            return collection
        except ConnectionFailure as e:
            logger.error(f"Error connecting to MongoDB (attempt {attempt + 1}): {e}")
            if attempt < retries - 1:
                time.sleep(delay)
            else:
                raise

def create(data):
    """
    Insert actual data into MongoDB.
    """
    try:
        collection = connect_to_mongodb()
        # Add the isPredicted flag for actual data
        data['isPredicted'] = False
        collection.insert_one(data)
        logger.info("Actual data inserted successfully.")
    except Exception as e:
        logger.error(f"Error inserting actual data: {e}")
        raise

def load_and_preprocess_data():
    """
    Load the dataset from MongoDB and preprocess it by handling missing values.
    """
    try:
        collection = connect_to_mongodb()
        # Fetch all documents from the collection
        data = list(collection.find({}))
        logger.debug(f"Fetched data: {data}")  # Add detailed logging
        # Convert the data to a pandas DataFrame
        df = pd.DataFrame(data)
        # Convert numeric fields from strings to numbers
        numeric_columns = [
            "Total Renewable Energy (GWh)",
            "Geothermal (GWh)",
            "Hydro (GWh)",
            "Biomass (GWh)",
            "Solar (GWh)",
            "Wind (GWh)",
            "Non-Renewable Energy (GWh)",
            "Total Power Generation (GWh)",
            "Population (in millions)",
            "Gross Domestic Product"
        ]
        for col in numeric_columns:
            if df[col].dtype == 'object':
                df[col] = pd.to_numeric(df[col].str.replace(",", ""), errors="coerce")
        # Forward fill missing values
        df = df.ffill()  # Use ffill() instead of fillna(method="ffill")
        # Ensure coordinates are included
        if 'Latitude' in df.columns and 'Longitude' in df.columns:
            df['coordinates'] = df.apply(lambda row: {'lat': row['Latitude'], 'lng': row['Longitude']}, axis=1)
        else:
            df['coordinates'] = None
        return df
    except Exception as e:
        logger.error(f"Error loading and preprocessing data: {e}")
        raise

def train_model(df, features, target):
    """
    Train a linear regression model for a given target variable.
    """
    X = df[features]
    y = df[target]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    model = LinearRegression()
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    mse = mean_squared_error(y_test, y_pred)
    print(f'\nModel Evaluation for {target}:\nMean Absolute Error (MAE): {mae}\nMean Squared Error (MSE): {mse}')
    return model

def forecast_production(model, df, features, start_year, end_year):
    """
    Forecast future production using the trained model.
    Returns a DataFrame with 'Year' and 'Predicted Production'.
    """
    future_years = pd.DataFrame({'Year': range(start_year, end_year + 1)})
    avg_population_growth = df['Population (in millions)'].pct_change().mean()
    avg_non_renewable_growth = df['Non-Renewable Energy (GWh)'].pct_change().mean()
    last_population = df['Population (in millions)'].iloc[-1]
    last_non_renewable = df['Non-Renewable Energy (GWh)'].iloc[-1]
    projected_population = [last_population * (1 + avg_population_growth) ** (year - df['Year'].iloc[-1]) for year in future_years['Year']]
    projected_non_renewable = [last_non_renewable * (1 + avg_non_renewable_growth) ** (year - df['Year'].iloc[-1]) for year in future_years['Year']]
    future_years['Population (in millions)'] = projected_population
    future_years['Non-Renewable Energy (GWh)'] = projected_non_renewable
    future_years[f'Predicted Production'] = model.predict(future_years[features])
    
    # Preserve the isPredicted flag for existing data
    future_years['isPredicted'] = future_years['Year'].apply(
        lambda year: df.loc[df['Year'] == year, 'isPredicted'].values[0] if year in df['Year'].values else True
    )
    
    return future_years[['Year', 'Predicted Production', 'isPredicted']]  # Include the flag in the output

def get_predictions(target, start_year, end_year):
    """
    Load the trained model and return predictions for the given target.
    """
    try:
        target = target + "_(gwh)"
        model_path = f'{target.replace(" ", "_").lower()}_model.pkl'
        
        # Log the model path
        logger.debug(f"Loading model from {model_path}")
        
        model = joblib.load(model_path)
        
        # Load data from MongoDB
        df = load_and_preprocess_data()
        
        features = ['Year', 'Population (in millions)', 'Non-Renewable Energy (GWh)']
        
        # Log the features
        logger.debug(f"Using features: {features}")
        
        predictions = forecast_production(model, df, features, start_year, end_year)
        
        # Log the predictions
        logger.debug(f"Predictions: {predictions}")
        
        return predictions
    except Exception as e:
        logger.error(f"Error in get_predictions: {e}")
        raise

def main():
    # Load data from MongoDB
    df = load_and_preprocess_data()
    features = ['Year', 'Population (in millions)', 'Non-Renewable Energy (GWh)']
    targets = ['Geothermal (GWh)', 'Hydro (GWh)', 'Biomass (GWh)', 'Solar (GWh)', 'Wind (GWh)']
    models = {}
    for target in targets:
        model = train_model(df, features, target)
        models[target] = model
        joblib.dump(model, f'{target.replace(" ", "_").lower()}_model.pkl')
    for target in targets:
        model = models[target]
        future_predictions = forecast_production(model, df, features, 2024, 2040)
        print(f"\nFuture Predictions for {target} (2024-2040):")
        print(future_predictions[['Year', 'Predicted Production']])
    
    # get_predictions('biomass')

if __name__ == "__main__":
    main()