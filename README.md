# Noise Monitoring Client

Simple react frontend to navigate sound level meter time series data.
1/3 octave integration data is aquired to Raspberry Pi from PCE 430 Class 1 sensor and pushed to Azure Storage account.

Data is integrated into 1s bins for LAeq, LBeq, LCeq, LZeq and each 1/3 band separately and added to a csv file per hour, so the file can have up to 3600 rows.

This client reads the data from the storage account and allows 
* Chart view 
  Rolling window or fix window, selection of timeseries and aggregations
* Traffic light view
  Define threshold for SPL equivalent constant values for loadest hour, this will match against 5m average and hour average and indicate
  ** green - below threshold
  ** yellow - risk of reaching threshold for the hour
  ** red - certain breach of threshold extrapolated from 5m window
  ** black - threshold exceeded for last hour
  
