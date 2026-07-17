"""
Bulk import CSV data to Zoho Catalyst Data Store
Run: python import_data_to_catalyst.py
"""

import os
import sys
import pandas as pd
import logging

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("import_data")

try:
    import zcatalyst_sdk
    catalyst_app = zcatalyst_sdk.initialize()
    log.info("✅ Catalyst SDK initialized")
except Exception as e:
    log.error(f"❌ Catalyst SDK not available: {e}")
    log.info("Make sure CATALYST_PROJECT_ID is set in environment variables")
    sys.exit(1)

# Get Data Store instance
datastore = catalyst_app.data_store()

# CSV files and their corresponding table names
CSV_FILES = {
    'data/CaseMaster.csv': 'CaseMaster',
    'data/Accused.csv': 'Accused',
    'data/CrimeHead.csv': 'CrimeHead',
    'data/ArrestSurrender.csv': 'ArrestSurrender',
}

def import_csv_to_table(csv_path: str, table_name: str):
    """Read CSV and insert rows into Catalyst Data Store table"""
    
    if not os.path.exists(csv_path):
        log.warning(f"⚠️  {csv_path} not found, skipping...")
        return
    
    try:
        df = pd.read_csv(csv_path)
        log.info(f"📖 Read {len(df)} rows from {csv_path}")
        
        # Get table
        table = datastore.table(table_name)
        
        # Insert each row
        inserted = 0
        for idx, row in df.iterrows():
            try:
                row_dict = row.to_dict()
                # Remove NaN values
                row_dict = {k: v for k, v in row_dict.items() if pd.notna(v)}
                
                table.insert(row_dict)
                inserted += 1
                
                if (inserted % 10) == 0:
                    log.info(f"  ✓ Inserted {inserted} rows into {table_name}...")
            except Exception as e:
                log.error(f"  ✗ Error inserting row {idx}: {e}")
        
        log.info(f"✅ Completed: {inserted}/{len(df)} rows inserted into {table_name}")
        
    except Exception as e:
        log.error(f"❌ Error importing {csv_path}: {e}")

def main():
    """Import all CSV files to Data Store"""
    log.info("🚀 Starting bulk import to Zoho Catalyst Data Store...")
    
    for csv_path, table_name in CSV_FILES.items():
        import_csv_to_table(csv_path, table_name)
    
    log.info("🎉 All imports completed!")

if __name__ == '__main__':
    main()
