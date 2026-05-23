import os
import sys
import time
import requests
import json

SERVER_URL = "http://localhost:4000"

def analyze_rab(file_path):
    if not os.path.exists(file_path):
        return {'status': 'error', 'message': f'File not found: {file_path}'}
        
    try:
        # 1. POST file to upload endpoint
        upload_url = f"{SERVER_URL}/api/upload"
        with open(file_path, 'rb') as f:
            files = {'file': (os.path.basename(file_path), f, 'application/pdf')}
            response = requests.post(upload_url, files=files)
            
        if response.status_code != 200:
            return {'status': 'error', 'message': f'Upload failed with status code {response.status_code}'}
            
        res_data = response.json()
        if not res_data.get('success') or not res_data.get('taskId'):
            return {'status': 'error', 'message': res_data.get('message', 'Failed to start analysis task')}
            
        task_id = res_data['taskId']
        
        # 2. Poll status endpoint until done
        status_url = f"{SERVER_URL}/api/upload/status/{task_id}"
        result_id = None
        
        for _ in range(30):  # max 60 seconds (30 * 2)
            time.sleep(2)
            status_res = requests.get(status_url)
            if status_res.status_code != 200:
                continue
                
            status_data = status_res.json()
            if status_data.get('success') and status_data.get('task'):
                status = status_data['task'].get('status')
                if status == 'done':
                    result_id = status_data['task'].get('result')
                    break
                elif status == 'error':
                    return {'status': 'error', 'message': status_data['task'].get('error', 'Task failed')}
                    
        if not result_id:
            return {'status': 'error', 'message': 'Analysis timed out'}
            
        # 3. Fetch final parsed result
        result_url = f"{SERVER_URL}/api/rab/{result_id}"
        result_res = requests.get(result_url)
        if result_res.status_code != 200:
            return {'status': 'error', 'message': f'Failed to retrieve result. Status: {result_res.status_code}'}
            
        result_data = result_res.json()
        if not result_data.get('success'):
            return {'status': 'error', 'message': result_data.get('message', 'Failed to retrieve result data')}
            
        app_url = os.environ.get("APP_URL", "http://100.78.157.19:4000").rstrip('/')
        return {
            'status': 'success',
            'result_id': result_id,
            'url': f"{app_url}?id={result_id}",
            'data': result_data['data']
        }
        
    except Exception as e:
        return {'status': 'error', 'message': str(e)}

if __name__ == '__main__':
    if len(sys.argv) > 1:
        try:
            input_data = json.loads(sys.argv[1])
            path = input_data.get('file_path')
            print(json.dumps(analyze_rab(path)))
        except Exception as e:
            print(json.dumps({'status': 'error', 'message': f'Invalid input or processing error: {str(e)}'}))
    else:
        print(json.dumps({'status': 'error', 'message': 'File path is required'}))
