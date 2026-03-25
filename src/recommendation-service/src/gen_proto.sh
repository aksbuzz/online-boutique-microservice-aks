python -m grpc_tools.protoc --python_out=. --grpc_python_out=. .\proto\Recommendation.proto -I.
python -m grpc_tools.protoc --python_out=. --grpc_python_out=. .\proto\Catalog.proto -I.