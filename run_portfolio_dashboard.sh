#!/usr/bin/env bash

cd "$(dirname "$0")" || exit 1

python3 -m streamlit run portfolio_dashboard.py --server.address 0.0.0.0 --server.port 8501
