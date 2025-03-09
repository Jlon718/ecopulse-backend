# filepath: /d:/TUP/ECOPULSE/backend/api/views.py
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from linearregression_predictiveanalysis import get_predictions, create, connect_to_mongodb  # Import the function here
from peertopeer import get_peer_to_predictions
from recommendations import get_solar_recommendations
import logging
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.views import View
import json
from django.views.decorators.http import require_http_methods

# Configure the logger
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

@require_GET
def get_renewable_energy_predictions(request, target):
    """
    API endpoint to get renewable energy predictions for a specific target.
    """
    try:
        start_year = request.GET.get('start_year', None)
        end_year = request.GET.get('end_year', None)
        if start_year:
            start_year = int(start_year)
        else:
            start_year = 2024  # Default start year if not provided
        if end_year:
            end_year = int(end_year)
        else:
            end_year = 2040
        # Get predictions for the specified target
        predictions = get_predictions(target, start_year, end_year)
        
        # Convert the DataFrame to a dictionary for JSON response
        predictions_dict = predictions.to_dict(orient='records')
        
        return JsonResponse({
            'status': 'success',
            'target': target,
            'predictions': predictions_dict
        })
    except Exception as e:
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)

@require_GET
def peertopeer_predictions(request):
    """
    API endpoint to get predictions based on year and filters.
    """
    try:
        year = request.GET.get('year')

        # Convert year to integer
        if year:
            year = int(year)
        else:
            year = 2026  # Default year if not provided

        # Split filters into a list

        logger.debug(f"Received request with year: {year}")

        # Get predictions for the specified year and filters
        predictions = get_peer_to_predictions(year)
        
        # Convert the DataFrame to a dictionary for JSON response
        predictions_dict = predictions.to_dict(orient='records')
        
        return JsonResponse({
            'status': 'success',
            'predictions': predictions_dict
        })
    except Exception as e:
        logger.error(f"Error in peertopeer_predictions: {e}")
        return JsonResponse({
            'status': 'error',
            'message': str(e)}
        , status=500)

@require_GET
def solar_recommendations(request):
    """
    API endpoint to get solar recommendations based on year and budget.
    """
    try:
        year = int(request.GET.get('year', 2026))
        budget = float(request.GET.get('budget', 0))

        logger.debug(f"Received request with year: {year}, budget: {budget}")

        # Get solar recommendations
        recommendations = get_solar_recommendations(year, budget)
        
        return JsonResponse({
            'status': 'success',
            'recommendations': recommendations
        })
    except Exception as e:
        logger.error(f"Error in solar_recommendations: {e}")
        return JsonResponse({
            'status': 'error',
            'message': str(e)}, status=500)

@method_decorator(csrf_exempt, name='dispatch')
class CreateView(View):
    def post(self, request):
        """
        API endpoint to insert actual data into MongoDB.
        """
        try:
            data = json.loads(request.body)
            create(data)
            return JsonResponse({'status': 'success', 'message': 'Data inserted successfully'})
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

@require_http_methods(["PUT"])
@csrf_exempt
def update_record(request, year):
    """
    API endpoint to update an existing record in MongoDB using the year.
    """
    try:
        data = json.loads(request.body)
        collection = connect_to_mongodb()
        
        # Log the incoming data and year
        logger.debug(f"Updating record for Year: {year} with data: {data}")
        
        # Fetch the existing record
        existing_record = collection.find_one({"Year": int(year)})
        if not existing_record:
            logger.error(f"Record not found for Year: {year}")
            return JsonResponse({'status': 'error', 'message': 'Record not found'}, status=404)
        
        # Calculate the new values for Total Power Generation and Total Renewable Energy
        total_renewable_energy = (
            data.get('Geothermal (GWh)', existing_record.get('Geothermal (GWh)', 0)) +
            existing_record.get('Hydro (GWh)', 0) +
            existing_record.get('Biomass (GWh)', 0) +
            existing_record.get('Solar (GWh)', 0) +
            existing_record.get('Wind (GWh)', 0)
        )
        
        total_power_generation = (
            total_renewable_energy +
            data.get('Non-Renewable Energy (GWh)', existing_record.get('Non-Renewable Energy (GWh)', 0))
        )
        
        # Update the data with the new calculated values
        data['Total Renewable Energy (GWh)'] = total_renewable_energy
        data['Total Power Generation (GWh)'] = total_power_generation
        
        result = collection.update_one(
            {"Year": int(year)},
            {"$set": data}
        )
        
        if result.matched_count == 0:
            logger.error(f"Record not found for Year: {year}")
            return JsonResponse({'status': 'error', 'message': 'Record not found'}, status=404)
        
        logger.info(f"Record updated successfully for Year: {year}")
        return JsonResponse({'status': 'success', 'message': 'Record updated successfully'})
    except Exception as e:
        logger.error(f"Error updating record: {e}")
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)

@require_http_methods(["DELETE"])
@csrf_exempt
def delete_record(request, year):
    """
    API endpoint to delete an existing record in MongoDB using the year.
    """
    try:
        collection = connect_to_mongodb()
        
        # Log the year of the record to be deleted
        logger.debug(f"Deleting record for Year: {year}")
        
        result = collection.delete_one({"Year": int(year)})
        
        if result.deleted_count == 0:
            logger.error(f"Record not found for Year: {year}")
            return JsonResponse({'status': 'error', 'message': 'Record not found'}, status=404)
        
        logger.info(f"Record deleted successfully for Year: {year}")
        return JsonResponse({'status': 'success', 'message': 'Record deleted successfully'})
    except Exception as e:
        logger.error(f"Error deleting record: {e}")
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)