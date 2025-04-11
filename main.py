from flask import Flask, request, jsonify, send_from_directory
import simpy
import random
import numpy as np
import pandas as pd
import json
import os

app = Flask(__name__)

# --- Your Simulation Code ---
class Factory(object):
    def __init__(self, env: simpy.Environment, fail_rate=0.02):  # Default fail_rate
        self._env = env
        self._total_products = 0
        self._total_faulty_products = 0
        self._resupply_device_occupancy = 0
        self._resupply_device_start_time = 0
        self._total_uptime = 0
        self._total_downtime = 0
        self._fixing_times = []
        self._bottleneck_delays = []
        self._station = [Workstation(env, i, fail_rate) for i in range(6)]
        self._supply = [simpy.Container(env, capacity=25, init=25) for _ in range(6)]
        self._resupply_device = simpy.Resource(env, capacity=3)
        self._resupplying = False
        self._prod = env.process(self.prod())
        for station in self._station:
            station._factory = self

    def prod(self) -> simpy.Environment:
        item_id = 0
        while True:
            item_id += 1
            for i in range(3):
                item_id = yield self._env.process(self._station[i].work(item_id))

            selection = random.randint(3, 4)
            next_selection = 3 if selection == 4 else 4
            item_id = yield self._env.process(self._station[selection].work(item_id))
            item_id = yield self._env.process(self._station[next_selection].work(item_id))

            yield self._env.process(self._station[5].work(item_id))

            if random.random() < 0.05:
                self._total_faulty_products += 1
            else:
                self._total_products += 1

    def resupply(self, supply):
        self._resupply_device_start_time = self._env.now
        with self._resupply_device.request() as req:
            yield req
            resupply_start_time = self._env.now
            while supply.level < supply.capacity:
                yield self._env.timeout(abs(np.random.normal(2)))
                supply.put(min(25, supply.capacity - supply.level))
            resupply_end_time = self._env.now
            self._resupply_device_occupancy += resupply_end_time - resupply_start_time

class Workstation(object):
    def __init__(self, env, id, fail_rate):
        self._env = env
        self._id = id
        self._fail_rate = fail_rate
        self._products_processed = 0
        self._resource = simpy.Resource(env, capacity=1)
        self._supply = simpy.Container(env, capacity=25, init=25)
        self._resupplying = False
        self._factory = None
        self._products_processed = 0
        self._occupancy_time = 0
        self._uptime = 0
        self._downtime = 0
        self._start_time = 0

    def _needs_resupply(self):
        return self._supply.level < 1 and not self._resupplying

    def work(self, item_id):
        while True:
            while self._needs_resupply():
                self._resupplying = True
                yield self._env.process(self._factory.resupply(self._supply))
                self._resupplying = False

            self.start_time = self._env.now
            with self._resource.request() as req:
                yield req
                work_start_time = self._env.now
                yield self._env.timeout(abs(np.random.normal(4)))
                work_end_time = self._env.now
                self._occupancy_time += work_end_time - work_start_time
                self._factory._total_uptime += work_end_time - work_start_time
                self._resource.release(req)

            self._products_processed += 1

            if random.random() < self._fail_rate and self._products_processed % 5 == 0:
                failure_start_time = self._env.now
                yield self._env.timeout(abs(np.random.exponential(3)))
                failure_end_time = self._env.now
                downtime_duration = failure_end_time - failure_start_time
                self._downtime += downtime_duration
                self._factory._total_downtime += downtime_duration
                continue

            self._supply.get(1)
            return item_id

class DataProcessor:
    def __init__(self, raw_data):
        self.raw_data = raw_data
        self.df = pd.DataFrame(raw_data)
        self.num_stations = 6

    def aggregate(self):
        aggregated_data = {
            "daily": [],
            "weekly": [],
            "monthly": [],
            "quarterly": [],
            "yearly": []
        }

        if self.df.empty:
            return aggregated_data

        max_sim_time = self.df['sim_end_time'].max()
        sorted_df = self.df.sort_values(by='sim_start_time')

        def aggregate_period(subset_df, period_length_minutes, period_name):
            if subset_df.empty:
                return None
            total_production = subset_df['final_production'].sum()
            total_faulty = subset_df['total_faulty'].sum()
            total_downtime = subset_df['total_downtime'].sum()
            total_resupply_occupancy = subset_df['resupply_occupancy'].sum()
            avg_station_occupancy = np.mean(np.array(list(subset_df['station_occupancy'])), axis=0).tolist() if not subset_df['station_occupancy'].empty else [0.0] * self.num_stations
            avg_station_downtime = np.mean(np.array(list(subset_df['station_downtime'])), axis=0).tolist() if not subset_df['station_downtime'].empty else [0.0] * self.num_stations

            production = {"total": int(total_production) if pd.notna(total_production) else 0,
                          "faulty_rate": 0.0,
                          "avg_daily_production": 0.0}
            if production["total"] > 0 and pd.notna(total_faulty):
                production["faulty_rate"] = float(total_faulty) / production["total"]
                production["avg_daily_production"] = total_production / (period_length_minutes / (24 * 60))

            occupancy = {"total": float(total_resupply_occupancy) if pd.notna(total_resupply_occupancy) else 0}
            downtime = {"total": float(total_downtime) if pd.notna(total_downtime) else 0}
            stations = [{"id": j + 1, "occupancy": float(avg_station_occupancy[j]) if isinstance(avg_station_occupancy, list) and len(avg_station_occupancy) > j else float(avg_station_occupancy) if isinstance(avg_station_occupancy, (int, float)) else 0.0,
                         "downtime": float(avg_station_downtime[j]) if isinstance(avg_station_downtime, list) and len(avg_station_downtime) > j else float(avg_station_downtime) if isinstance(avg_station_downtime, (int, float)) else 0.0}
                        for j in range(self.num_stations)]
            return {"period": period_name, "production": production, "downtime": downtime, "occupancy": occupancy, "stations": stations}

        daily_minutes = 24 * 60
        weekly_minutes = 7 * daily_minutes
        monthly_minutes = 30 * daily_minutes  # Approximate
        quarterly_minutes = 90 * daily_minutes # Approximate
        yearly_minutes = 365 * daily_minutes # Approximate

        # Daily Aggregation
        for day in range(int(max_sim_time / daily_minutes) + 1):
            start = day * daily_minutes
            end = (day + 1) * daily_minutes
            subset = sorted_df[(sorted_df['sim_start_time'] >= start) & (sorted_df['sim_end_time'] <= end)]
            aggregated = aggregate_period(subset, daily_minutes, f"Day {day + 1}")
            if aggregated:
                aggregated_data["daily"].append(aggregated)

        # Weekly Aggregation
        for week in range(int(max_sim_time / weekly_minutes) + 1):
            start = week * weekly_minutes
            end = (week + 1) * weekly_minutes
            subset = sorted_df[(sorted_df['sim_start_time'] >= start) & (sorted_df['sim_end_time'] <= end)]
            aggregated = aggregate_period(subset, weekly_minutes, f"Week {week + 1}")
            if aggregated:
                aggregated_data["weekly"].append(aggregated)

        # Monthly Aggregation
        for month in range(int(max_sim_time / monthly_minutes) + 1):
            start = month * monthly_minutes
            end = (month + 1) * monthly_minutes
            subset = sorted_df[(sorted_df['sim_start_time'] >= start) & (sorted_df['sim_end_time'] <= end)]
            aggregated = aggregate_period(subset, monthly_minutes, f"Month {month + 1}")
            if aggregated:
                aggregated_data["monthly"].append(aggregated)

        # Quarterly Aggregation
        for quarter in range(int(max_sim_time / quarterly_minutes) + 1):
            start = quarter * quarterly_minutes
            end = (quarter + 1) * quarterly_minutes
            subset = sorted_df[(sorted_df['sim_start_time'] >= start) & (sorted_df['sim_end_time'] <= end)]
            aggregated = aggregate_period(subset, quarterly_minutes, f"Quarter {quarter + 1}")
            if aggregated:
                aggregated_data["quarterly"].append(aggregated)

        # Yearly Aggregation
        for year in range(int(max_sim_time / yearly_minutes) + 1):
            start = year * yearly_minutes
            end = (year + 1) * yearly_minutes
            subset = sorted_df[(sorted_df['sim_start_time'] >= start) & (sorted_df['sim_end_time'] <= end)]
            aggregated = aggregate_period(subset, yearly_minutes, f"Year {year + 1}")
            if aggregated:
                aggregated_data["yearly"].append(aggregated)

        return aggregated_data
    
@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/run_simulation', methods=['POST'])
def run_simulation_endpoint():
    print(">>> /run_simulation route was hit!")  # DEBUG - KEEP THIS!
    try:
        sim_time = 24 * 60
        num_days = 365

        all_raw_data = []

        for day in range(num_days):
            env = simpy.Environment()
            factory = Factory(env)
            env.run(until=sim_time)

            raw_data_day = []
            total_faulty_day = factory._total_faulty_products
            total_downtime_day = factory._total_downtime
            resupply_occupancy_day = factory._resupply_device_occupancy

            # Collect data for each station for the current day
            station_occupancies_day = [station._occupancy_time for station in factory._station]
            station_downtimes_day = [station._downtime for station in factory._station]
            station_productions_day = [station._products_processed for station in factory._station]

            data_point = {
                "day": day + 1,
                "final_production": sum(station_productions_day), # Sum of production across all stations for the day
                "station_occupancy": station_occupancies_day,
                "station_downtime": station_downtimes_day,
                "total_faulty": total_faulty_day,
                "sim_start_time": day * sim_time,
                "sim_end_time": (day + 1) * sim_time,
                "resupply_occupancy": resupply_occupancy_day,
                "total_downtime": total_downtime_day
            }
            raw_data_day.append(data_point)
            all_raw_data.extend(raw_data_day)

        processor = DataProcessor(all_raw_data)
        aggregated_data = processor.aggregate()

        output_filename = os.path.join("static/data", "data.json")  # You can customize the filename
        with open(output_filename, 'w') as f:
            json.dump(aggregated_data, f, indent=4)  # Save with indentation for readability

        return jsonify(aggregated_data)
    except Exception as e:
        print(f">>> Error in route: {e}")  # DEBUG - KEEP THIS!
        return jsonify({"error": str(e)}), 500
    
if __name__ == '__main__':
    app.run(debug=True)