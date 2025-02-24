from django.urls import path
from .views import get_renewable_energy_predictions

urlpatterns = [
    path('predictions/<str:target>/', get_renewable_energy_predictions, name='get_predictions'),
]