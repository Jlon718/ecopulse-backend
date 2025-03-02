import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
import os
import logging

# Configure the logger
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Load dataset
script_dir = os.path.dirname(os.path.abspath(__file__))
file_path = os.path.join(script_dir, 'peertopeer.xlsx')
df = pd.read_excel(file_path)

# Display DataFrame columns and first few rows
print("DataFrame Columns:")
print(df.columns)
print("\nFirst few rows of the DataFrame:")
print(df.head())

# Define subgrid names and metrics
subgrids = ['Bohol', 'Cebu', 'Negros', 'Panay', 'Leyte-Samar']
metrics = [
    'Total Power Generation (GWh)',
    'Total Non-Renewable Energy (GWh)',
    'Total Renewable Energy (GWh)',
    'Geothermal (GWh)',
    'Hydro (GWh)',
    'Biomass (GWh)',
    'Solar (GWh)',
    'Wind (GWh)',
    'Visayas Total Power Consumption (GWh)'  # Ensure this metric is included
]

# Create a dictionary to hold DataFrames for each subgrid
subgrid_data = {}

# Extract data for each subgrid and metric
for subgrid in subgrids:
    # Filter columns that belong to the current subgrid and metrics
    subgrid_columns = ['Year'] + [f'{subgrid} {metric}' for metric in metrics if f'{subgrid} {metric}' in df.columns]

    if len(subgrid_columns) > 1:  # Ensure there are relevant columns
        # Create a DataFrame for the subgrid with 'Year' and its specific columns
        subgrid_df = df[subgrid_columns].copy()

        # Rename columns to remove the subgrid prefix for clarity
        subgrid_df.columns = ['Year'] + [col.replace(f'{subgrid} ', '') for col in subgrid_columns[1:]]

        # Store the DataFrame in the dictionary
        subgrid_data[subgrid] = subgrid_df
    else:
        print(f"No data found for subgrid: {subgrid}")

# Function to perform linear regression and predict future values
def predict_future(df, column, target_year=2040):
    # Drop rows with missing values in the specified column
    df = df.dropna(subset=[column])

    # Prepare the data
    X = df['Year'].values.reshape(-1, 1)  # Years as the independent variable
    y = df[column].values  # Metric values as the dependent variable

    # Initialize and fit the model
    model = LinearRegression()
    model.fit(X, y)

    # Calculate the number of years ahead
    max_year = df['Year'].max()
    years_ahead = target_year - max_year

    # Predict future values
    future_years = np.arange(max_year + 1, target_year + 1).reshape(-1, 1)
    predictions = model.predict(future_years)

    return future_years.flatten(), predictions

# Function to get predictions based on energy type and year
def get_peer_to_predictions(year=None):
    """
    Predict energy metrics for a given year.

    Parameters:
        year (int): The target year for predictions. Defaults to 2026 if null.

    Returns:
        pd.DataFrame: A DataFrame containing predicted values for the selected metrics,
                      including the place's predicted power consumption.
    """
    if year is None:
        year = 2026

    all_predictions = []

    # Predict Visayas Total Power Generation and Consumption for the specified year
    if 'Visayas Total Power Generation (GWh)' in df.columns:
        future_years, visayas_power_gen_predictions = predict_future(df, 'Visayas Total Power Generation (GWh)', target_year=year)
        visayas_power_gen_dict = dict(zip(future_years, visayas_power_gen_predictions))
    else:
        print("Column 'Visayas Total Power Generation (GWh)' not found in DataFrame.")
        visayas_power_gen_dict = {}

    if 'Visayas Total Power Consumption (GWh)' in df.columns:
        future_years, visayas_consumption_predictions = predict_future(df, 'Visayas Total Power Consumption (GWh)', target_year=year)
        visayas_consumption_dict = dict(zip(future_years, visayas_consumption_predictions))
    else:
        print("Column 'Visayas Total Power Consumption (GWh)' not found in DataFrame.")
        visayas_consumption_dict = {}

    # Iterate over each subgrid (place)
    for place, df_place in subgrid_data.items():
        print(f"\nProcessing data for {place}:")
        print(df_place.head())

        # Check if the required columns exist in the DataFrame
        if 'Total Power Generation (GWh)' in df_place.columns:
            # Predict the place's total power generation
            future_years, power_generation_predictions = predict_future(df_place, 'Total Power Generation (GWh)', target_year=year)
            print(f"Predicted Power Generation for {place}:")
            print(dict(zip(future_years, power_generation_predictions)))

            # Predict the place's estimated consumption
            place_consumption_predictions = []
            for year_val, power_gen in zip(future_years, power_generation_predictions):
                # Get the predicted Visayas Total Power Generation and Consumption for the year
                visayas_power_gen = visayas_power_gen_dict.get(year_val, np.nan)
                visayas_consumption = visayas_consumption_dict.get(year_val, np.nan)

                if not np.isnan(visayas_power_gen) and not np.isnan(visayas_consumption):
                    # Calculate the ratio of the place's power generation to the total Visayas power generation
                    ratio = power_gen / visayas_power_gen
                    # Multiply by Visayas total consumption to get the place's estimated consumption
                    place_consumption = ratio * visayas_consumption
                    place_consumption_predictions.append(place_consumption)
                else:
                    # If no data is found for the year, append NaN
                    print(f"No predicted data found for year {year_val} in Visayas Total Power Generation or Consumption.")
                    place_consumption_predictions.append(np.nan)

            # Add the place's predicted power generation and consumption to the predictions DataFrame
            predictions_df = pd.DataFrame({
                'Year': future_years,
                'Place': place,
                'Energy Type': 'Total Power Generation (GWh)',
                'Predicted Value': power_generation_predictions
            })
            all_predictions.append(predictions_df)

            predictions_df_consumption = pd.DataFrame({
                'Year': future_years,
                'Place': place,
                'Energy Type': f'{place} Estimated Consumption (GWh)',
                'Predicted Value': place_consumption_predictions
            })
            all_predictions.append(predictions_df_consumption)

        # Predict future values for each metric
        for metric in metrics:
            if metric in df_place.columns:
                future_years, predictions = predict_future(df_place, metric, target_year=year)
                predictions_df = pd.DataFrame({
                    'Year': future_years,
                    'Place': place,
                    'Energy Type': metric,
                    'Predicted Value': predictions
                })
                all_predictions.append(predictions_df)

    # Filter the predictions for the specified year
    if all_predictions:
        all_predictions_df = pd.concat(all_predictions, ignore_index=True)
        return all_predictions_df[all_predictions_df['Year'] == year]
    else:
        return pd.DataFrame()

# Example usage
predictions = get_peer_to_predictions(year=2026)
print(predictions)