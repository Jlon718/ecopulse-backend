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

# Configure the logger
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

def load_and_preprocess_data(file_path):
    """
    Load the dataset and preprocess it by handling missing values.
    """
    df = pd.read_excel(file_path)
    df = df.fillna(method='ffill')  # Forward fill missing values
    return df

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
    return future_years[['Year', 'Predicted Production']]  # Return only the required columns

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
        
        script_dir = os.path.dirname(os.path.abspath(__file__))
        data_path = os.path.join(script_dir, 'EcoPulse-Data.xlsx')
        
        # Log the data path
        logger.debug(f"Loading data from {data_path}")
        
        df = load_and_preprocess_data(data_path)
        
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
    script_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(script_dir, 'EcoPulse-Data.xlsx')
    df = load_and_preprocess_data(file_path)
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