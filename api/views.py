# filepath: /d:/TUP/ECOPULSE/backend/api/views.py
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from linearregression_predictiveanalysis import get_predictions

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