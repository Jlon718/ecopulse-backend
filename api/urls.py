from django.urls import path
from .views import get_renewable_energy_predictions, peertopeer_predictions, solar_recommendations, CreateView, update_record, delete_record, recover_record

urlpatterns = [
    path('predictions/<str:target>/', get_renewable_energy_predictions, name='get_predictions'),
    path('peertopeer/', peertopeer_predictions, name='peertopeer_predictions'),
    path('solar_recommendations/', solar_recommendations, name='solar_recommendations'),
    path('create/', CreateView.as_view(), name='insert_actual_data'),
    path('update/<int:year>/', update_record, name='update_record'),
    path('delete/<int:year>/', delete_record, name='delete_record'),
    path('recover/<int:year>/', recover_record, name='recover_record')
]