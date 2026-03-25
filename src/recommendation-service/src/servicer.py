import random

from proto import Recommendation_pb2, Recommendation_pb2_grpc
from catalog_client import get_all_products
from logger import get_logger

logger = get_logger("recommendation-service")

_MAX_RESULTS = 5


class RecommendationServicer(Recommendation_pb2_grpc.RecommendationServiceServicer):

    def ListRecommendations(self, request, context):
        input_ids = set(request.product_ids)
        products = get_all_products()

        # Build the set of categories that the cart products belong to.
        input_categories: set[str] = set()
        for product in products:
            if product.id in input_ids:
                input_categories.update(product.categories)

        if not input_categories:
            logger.info("no categories found for input products, returning empty list")
            return Recommendation_pb2.ListRecommendationsResponse(product_ids=[])

        # Collect products that share at least one category, excluding input IDs.
        candidates = [
            p.id for p in products
            if p.id not in input_ids and set(p.categories) & input_categories
        ]

        random.shuffle(candidates)
        result = candidates[:_MAX_RESULTS]

        logger.info(f"recommendations for user={request.user_id}: {len(result)} results")
        return Recommendation_pb2.ListRecommendationsResponse(product_ids=result)