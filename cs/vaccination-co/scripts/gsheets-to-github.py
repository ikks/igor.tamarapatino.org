from __future__ import print_function
import httplib2
import sys

from googleapiclient import discovery

try:
    from vaccinationcosecrets import APIKEY
except ModuleNotFoundError:
    sys.exit('Please remember to create the file vaccinationcosecrets.py with your APIKEY')

# If modifying these scopes, delete the file token.json.
SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']

# The ID and range of a sample spreadsheet.
SPREADSHEET_ID = '1z2KYfMvDMLHb3f1xQMDHM5Q9ll_vIwe764XBBQF7P2E'
sheet_orig = 'Originales!A1:AQ1200'
sheet_summ = 'Resumen!A1:AQ1200'
sheet_plan = 'Plan!A1:AQ200'
sheet_assi = 'Resoluciones!A1:F200'


def main():
    """Shows basic usage of the Sheets API.
    Prints values from a sample spreadsheet.
    """
    discoveryUrl = ('https://sheets.googleapis.com/$discovery/rest?'
                    'version=v4')
    service = discovery.build(
        'sheets',
        'v4',
        http=httplib2.Http(),
        discoveryServiceUrl=discoveryUrl,
        developerKey=APIKEY)

    spreadsheetId = SPREADSHEET_ID
    result = service.spreadsheets().values().batchGet(
        spreadsheetId=spreadsheetId, ranges=[sheet_orig, sheet_summ, sheet_plan, sheet_assi]).execute()
    ranges = result.get('valueRanges', [])
    
    if not ranges:
        print('No data found.')
    else:
        print('{0} ranges retrieved.'.format(len(ranges)))

if __name__ == '__main__':
    main()